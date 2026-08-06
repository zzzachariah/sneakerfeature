// Pure timer math for a court session — the run you're in right now, which the
// Dynamic Island counts up while the phone is in your bag.
//
// The only thing persisted is when the clock started, never a running total:
// nothing here has to tick. The app, the Live Activity and the Android
// notification each derive elapsed time from the same timestamps, so a session
// survives a reload, a force-quit, or an hour with the screen off, and all
// three surfaces agree without anyone pushing an update.
//
// No React, no storage, no Capacitor — see court-session-store.ts for the side
// effects and components/closet/court-session-provider.tsx for the UI wiring.

export type CourtSession = {
  id: string;
  shoeId: string;
  shoeName: string;
  shoeBrand: string;
  imageUrl: string | null;
  /** Epoch ms when the very first leg began — the "playing since" the card shows. */
  startedAt: number;
  /** Epoch ms the current leg began, or null while paused. */
  runningSince: number | null;
  /** Milliseconds banked by legs that already ended. */
  accumulatedMs: number;
};

/**
 * A session left running past this is a session someone forgot to stop — the
 * phone went in a bag after the run and came out the next morning. Twelve hours
 * is well past any real run and past the point ActivityKit keeps a Live
 * Activity alive, so capping here means the worst case is a wrong-but-bounded
 * log the user can edit, never a 14-hour session silently added to a midsole's
 * wear budget.
 */
export const MAX_SESSION_MS = 12 * 60 * 60 * 1000;

/** Sessions are logged to the nearest 3 minutes; nobody hoops to the second. */
export const SESSION_ROUND_HOURS = 0.05;

/** Below this a session is a mis-tap, not a run, and is discarded on stop. */
export const MIN_LOGGABLE_HOURS = SESSION_ROUND_HOURS;

export function createCourtSession(
  input: { id: string; shoeId: string; shoeName: string; shoeBrand: string; imageUrl?: string | null },
  now: number
): CourtSession {
  return {
    id: input.id,
    shoeId: input.shoeId,
    shoeName: input.shoeName,
    shoeBrand: input.shoeBrand,
    imageUrl: input.imageUrl ?? null,
    startedAt: now,
    runningSince: now,
    accumulatedMs: 0
  };
}

export function isRunning(session: CourtSession): boolean {
  return session.runningSince !== null;
}

/** Elapsed play time, capped at MAX_SESSION_MS. Never negative. */
export function elapsedMs(session: CourtSession, now: number): number {
  const live = session.runningSince === null ? 0 : Math.max(0, now - session.runningSince);
  return Math.min(MAX_SESSION_MS, Math.max(0, session.accumulatedMs + live));
}

export function pauseSession(session: CourtSession, now: number): CourtSession {
  if (session.runningSince === null) return session;
  return {
    ...session,
    accumulatedMs: elapsedMs(session, now),
    runningSince: null
  };
}

export function resumeSession(session: CourtSession, now: number): CourtSession {
  if (session.runningSince !== null) return session;
  return { ...session, runningSince: now };
}

/** True once the session has run past the cap and should be stopped for them. */
export function isOverrun(session: CourtSession, now: number): boolean {
  return elapsedMs(session, now) >= MAX_SESSION_MS;
}

/**
 * Hours to log, rounded to SESSION_ROUND_HOURS. Returns 0 for anything under
 * MIN_LOGGABLE_HOURS so the caller can drop a mis-tap instead of writing a
 * zero-ish row that the wear API would reject anyway (hours must be > 0).
 */
export function loggableHours(session: CourtSession, now: number): number {
  const hours = elapsedMs(session, now) / 3_600_000;
  const rounded = Math.round(hours / SESSION_ROUND_HOURS) * SESSION_ROUND_HOURS;
  // Rounding introduces float dust (0.15000000000000002); two decimals is
  // exact for every multiple of 0.05 and is what the API stores.
  const clean = Math.round(rounded * 100) / 100;
  if (clean < MIN_LOGGABLE_HOURS) return 0;
  return Math.min(24, clean);
}

/** "1:23:45" while running long, "23:45" under an hour — matches the widget. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Where a finished run leads: the closet, with that pair's receipt open.
 *
 * Keyed by shoe rather than by wear-log id because the two places a run can end
 * know different things. Ending in the app gets the log row back from the API;
 * ending from the Dynamic Island happens in a background process that can't
 * write to the database at all — the log is posted later, when the app next
 * resumes. A shoe id is the only handle both sides have at the moment the
 * activity ends, and "that pair's newest run" resolves to the same thing.
 */
export function sessionReceiptPath(shoeId: string): string {
  return `/closet?session=${encodeURIComponent(shoeId)}`;
}

/** Local date (YYYY-MM-DD) a session belongs to, for the wear log's played_at. */
export function sessionPlayedAt(session: CourtSession, now: number): string {
  // A run that starts at 22:30 and ends at 00:10 belongs to the day it started
  // — that is the night the user remembers playing.
  const d = new Date(session.startedAt || now);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}
