"use client";

// Owns the one court session a user can have running, app-wide.
//
// Mounted in the root layout because a run outlives the page you started it on:
// you tap 开场 on /closet, then browse shoes, then put the phone away for two
// hours. The session has to survive all of that — and it has to agree with the
// Dynamic Island, which keeps counting whether or not the WebView is alive.
//
// Three surfaces can move this state and none of them can see the others:
//   • the web UI (this provider),
//   • the home-screen widget's 开场 button (an App Intent, app in the background),
//   • the Live Activity's 结束 button (same).
// The last two write into a queue in the shared App Group container; on every
// mount and every resume we drain that queue and fold it into web state. Native
// is authoritative about *what happened*, this provider about *what it means* —
// only the web side has a session cookie, so only it can write the wear log.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  createCourtSession,
  elapsedMs as computeElapsed,
  isOverrun,
  isRunning,
  loggableHours,
  pauseSession,
  resumeSession,
  sessionPlayedAt,
  sessionReceiptPath,
  type CourtSession
} from "@/lib/closet/court-session";
import {
  newSessionId,
  readStoredSession,
  requestWidgetRefresh,
  writeStoredSession
} from "@/lib/closet/court-session-store";
import { logWear } from "@/components/closet/closet-api";
import {
  endCourtActivity,
  readNativeCourtSession,
  startCourtActivity,
  takePendingCourtIntents,
  updateCourtActivity
} from "@/lib/native/live-widgets";
import { readWidgetPrefs } from "@/lib/native/widget-prefs";
import { haptics } from "@/lib/native/haptics";

/** The in-app path the user is on, as a deep-linkable "/path?query" string. */
function currentPath(): string {
  if (typeof window === "undefined") return "/closet";
  const path = `${window.location.pathname}${window.location.search}`;
  // Guard the same way pathFromDeepLink does on the way back in: anything that
  // could resolve against another origin is not a path we'd follow.
  return path.startsWith("/") && !path.startsWith("//") ? path : "/closet";
}

export type CourtSessionShoe = {
  shoeId: string;
  shoeName: string;
  shoeBrand: string;
  imageUrl?: string | null;
  /** Lifetime totals shown on the Live Activity; native falls back to the snapshot at 0. */
  totalHours?: number;
  totalSessions?: number;
};

export type StopResult =
  | { status: "logged"; hours: number; shoeId: string }
  | { status: "too-short" }
  | { status: "error"; message: string };

type CourtSessionContextValue = {
  session: CourtSession | null;
  running: boolean;
  busy: boolean;
  start: (shoe: CourtSessionShoe) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<StopResult>;
  discard: () => void;
};

const CourtSessionContext = createContext<CourtSessionContextValue | null>(null);

export function useCourtSession(): CourtSessionContextValue {
  const ctx = useContext(CourtSessionContext);
  if (!ctx) {
    throw new Error("useCourtSession must be used inside <CourtSessionProvider>");
  }
  return ctx;
}

/**
 * Live elapsed milliseconds, ticking once a second.
 *
 * Deliberately a hook rather than provider state: the provider wraps the whole
 * app, and re-rendering that tree every second to move one digit would be a
 * tax on every page. Only the components that actually display the clock pay.
 */
export function useElapsed(session: CourtSession | null): number {
  const [, force] = useState(0);
  const running = session !== null && isRunning(session);

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  return session ? computeElapsed(session, Date.now()) : 0;
}

export function CourtSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CourtSession | null>(null);
  const [busy, setBusy] = useState(false);
  // Read inside async callbacks and native listeners, where the state closure
  // is a render behind and would resurrect a session the user just stopped.
  const sessionRef = useRef<CourtSession | null>(null);

  const commit = useCallback((next: CourtSession | null) => {
    sessionRef.current = next;
    setSession(next);
    writeStoredSession(next);
  }, []);

  // --- start / pause / resume / stop -----------------------------------------

  const start = useCallback(
    async (shoe: CourtSessionShoe) => {
      if (sessionRef.current) return; // one run at a time; the UI hides the CTA
      const now = Date.now();
      const next = createCourtSession(
        {
          id: newSessionId(),
          shoeId: shoe.shoeId,
          shoeName: shoe.shoeName,
          shoeBrand: shoe.shoeBrand,
          imageUrl: shoe.imageUrl ?? null
        },
        now
      );
      commit(next);
      haptics.success();

      if (readWidgetPrefs().courtActivity) {
        await startCourtActivity({
          id: next.id,
          shoeId: next.shoeId,
          shoeName: next.shoeName,
          shoeBrand: next.shoeBrand,
          imageUrl: next.imageUrl,
          startedAt: next.startedAt,
          totalHours: shoe.totalHours ?? 0,
          totalSessions: shoe.totalSessions ?? 0,
          returnPath: currentPath()
        });
      }
    },
    [commit]
  );

  const pause = useCallback(() => {
    const current = sessionRef.current;
    if (!current || !isRunning(current)) return;
    const next = pauseSession(current, Date.now());
    commit(next);
    haptics.selection();
    void updateCourtActivity({
      id: next.id,
      runningSince: next.runningSince,
      accumulatedMs: next.accumulatedMs
    });
  }, [commit]);

  const resume = useCallback(() => {
    const current = sessionRef.current;
    if (!current || isRunning(current)) return;
    const next = resumeSession(current, Date.now());
    commit(next);
    haptics.selection();
    void updateCourtActivity({
      id: next.id,
      runningSince: next.runningSince,
      accumulatedMs: next.accumulatedMs
    });
  }, [commit]);

  /** Ends the run and writes the wear log. The session is cleared either way. */
  const finish = useCallback(
    async (target: CourtSession, at: number): Promise<StopResult> => {
      const hours = loggableHours(target, at);
      commit(null);
      await endCourtActivity(target.id, hours, sessionReceiptPath(target.shoeId));

      if (hours <= 0) {
        haptics.selection();
        return { status: "too-short" };
      }

      const res = await logWear({
        shoeId: target.shoeId,
        hours,
        playedAt: sessionPlayedAt(target, at)
      });
      if (!res.ok) {
        haptics.error();
        return { status: "error", message: res.message ?? "Something went wrong." };
      }
      haptics.success();
      requestWidgetRefresh();
      return { status: "logged", hours, shoeId: target.shoeId };
    },
    [commit]
  );

  const stop = useCallback(async (): Promise<StopResult> => {
    const current = sessionRef.current;
    if (!current || busy) return { status: "too-short" };
    setBusy(true);
    try {
      return await finish(current, Date.now());
    } finally {
      setBusy(false);
    }
  }, [busy, finish]);

  /** Throw the run away without logging it — a mis-tap, or the wrong pair. */
  const discard = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    commit(null);
    void endCourtActivity(current.id, 0, sessionReceiptPath(current.shoeId));
    haptics.selection();
  }, [commit]);

  // --- reconciliation with native --------------------------------------------

  const reconcile = useCallback(async () => {
    const now = Date.now();
    let current = sessionRef.current;

    // 1. Fold in whatever happened while the WebView wasn't listening. Native
    //    hands each intent over exactly once, oldest first.
    for (const intent of await takePendingCourtIntents()) {
      if (intent.kind === "start") {
        if (current) continue; // a run was already going; ignore the duplicate
        current = {
          id: intent.sessionId,
          shoeId: intent.shoeId,
          shoeName: intent.shoeName ?? "",
          shoeBrand: intent.shoeBrand ?? "",
          imageUrl: null,
          startedAt: intent.at,
          runningSince: intent.at,
          accumulatedMs: 0
        };
      } else if (intent.kind === "end") {
        // Ended from the Island. Reconstruct what it counted so the wear log
        // matches what the user watched, not the time since we noticed.
        const ended: CourtSession = current?.id === intent.sessionId
          ? { ...current, runningSince: null, accumulatedMs: intent.elapsedMs }
          : {
              id: intent.sessionId,
              shoeId: intent.shoeId,
              shoeName: "",
              shoeBrand: "",
              imageUrl: null,
              startedAt: intent.at - intent.elapsedMs,
              runningSince: null,
              accumulatedMs: intent.elapsedMs
            };
        current = null;
        sessionRef.current = null;
        await finish(ended, intent.at);
      }
    }

    // 2. No web session, but native still has a live one (queue already drained
    //    in an earlier page view, or storage was cleared): adopt it.
    if (!current) {
      const native = await readNativeCourtSession();
      if (native) {
        current = {
          id: native.id,
          shoeId: native.shoeId,
          shoeName: native.shoeName ?? "",
          shoeBrand: native.shoeBrand ?? "",
          imageUrl: null,
          startedAt: native.startedAt,
          runningSince: native.runningSince,
          accumulatedMs: native.accumulatedMs
        };
      }
    }

    if (!current) {
      if (sessionRef.current) commit(null);
      return;
    }

    // 3. Ran past the cap — the phone went in a bag and stayed there. Bank the
    //    capped time rather than letting it grow, and tell the user by way of
    //    the log that appears in their closet.
    if (isOverrun(current, now)) {
      sessionRef.current = null;
      await finish(current, now);
      return;
    }

    commit(current);
  }, [commit, finish]);

  // Where a tap on the Island (or on the widget) should land while a run is
  // going: the page they were last looking at.
  //
  // Pushed when the app leaves the foreground, not on every navigation. That's
  // both cheap — ActivityKit throttles updates, and browsing shoes mid-session
  // would burn the budget in minutes — and semantically exact: "where I left
  // off" is only settled at the moment they leave.
  useEffect(() => {
    if (!session) return;
    let cleanup: (() => void) | undefined;
    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) return;
          const current = sessionRef.current;
          if (!current) return;
          void updateCourtActivity({
            id: current.id,
            runningSince: current.runningSince,
            accumulatedMs: current.accumulatedMs,
            returnPath: currentPath()
          });
        });
        cleanup = () => handle.remove();
      } catch {
        /* not in the native shell */
      }
    })();
    return () => cleanup?.();
  }, [session]);

  // Restore on mount, then reconcile whenever the app comes back to the
  // foreground — that resume is the moment a widget-started run becomes visible.
  useEffect(() => {
    const stored = readStoredSession();
    if (stored) {
      sessionRef.current = stored;
      setSession(stored);
    }
    void reconcile();

    let cleanup: (() => void) | undefined;
    void (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) void reconcile();
        });
        cleanup = () => handle.remove();
      } catch {
        /* not in the native shell */
      }
    })();

    return () => cleanup?.();
    // reconcile is stable (useCallback over stable deps); run this once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A run left going past the cap while the app stays open. Checked on a slow
  // timer because the exact second doesn't matter — only that it stops.
  useEffect(() => {
    if (!session || !isRunning(session)) return;
    const id = window.setInterval(() => {
      const current = sessionRef.current;
      if (current && isOverrun(current, Date.now())) void reconcile();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [session, reconcile]);

  const value = useMemo<CourtSessionContextValue>(
    () => ({
      session,
      running: session !== null && isRunning(session),
      busy,
      start,
      pause,
      resume,
      stop,
      discard
    }),
    [session, busy, start, pause, resume, stop, discard]
  );

  return <CourtSessionContext.Provider value={value}>{children}</CourtSessionContext.Provider>;
}
