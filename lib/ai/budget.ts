// Wall-clock budget for a single AI turn.
//
// The Smart Picker and the advisor stream for as long as the model thinks, and
// a serverless function is killed the instant it exceeds its duration limit.
// When that happens mid-stream the socket dies before the route can send
// anything, so the user watches a full minute of real "thinking" and then gets
// a bare "请求失败，请稍后重试。" with no cards — exactly the failure reported for
// the premium models. Nothing about it is tier-specific: the reasoning models
// (Fable / Opus) just think longest, so they hit the ceiling first.
//
// Two halves of the fix live here:
//   1. AI_ROUTE_MAX_DURATION documents how long each AI route asks the platform
//      to let it run. Next.js needs `export const maxDuration` to be a literal,
//      so every AI route repeats the number — keep them in sync with this one.
//   2. Every upstream call runs against a deadline that expires BEFORE that
//      limit, so the pipeline stops on its own terms, finalizes, and returns a
//      real answer (its own picks, or the deterministic fallback) instead of
//      being cut off with nothing.

/** Seconds each AI route asks the platform for. Mirror in `export const maxDuration`. */
export const AI_ROUTE_MAX_DURATION = 300;

/** Head-room kept for finalizing: fallback picks, DB writes, the closing SSE frames. */
const FINALIZE_RESERVE_MS = 30_000;

/** Ceiling on one upstream call, even with the whole budget still unspent. */
const MAX_CALL_TIMEOUT_MS = 150_000;

/** Below this there isn't enough wall clock left for another model call to be worth starting. */
export const MIN_CALL_BUDGET_MS = 20_000;

export type Deadline = { at: number };

/**
 * Seconds one AI turn may spend before it must finalize. Defaults to the route's
 * duration minus the finalize reserve. Override with AI_TURN_BUDGET_SECONDS when
 * the deployment's real function ceiling is lower than AI_ROUTE_MAX_DURATION —
 * `maxDuration` has to be a literal in each route, but this side is tunable
 * without a code change. Out-of-range values fall back to the default.
 */
function defaultBudgetMs(): number {
  const fallback = AI_ROUTE_MAX_DURATION * 1000 - FINALIZE_RESERVE_MS;
  const raw = Number(process.env.AI_TURN_BUDGET_SECONDS);
  if (!Number.isFinite(raw) || raw < 15 || raw > AI_ROUTE_MAX_DURATION) return fallback;
  return Math.round(raw * 1000);
}

export function startDeadline(totalMs = defaultBudgetMs()): Deadline {
  return { at: Date.now() + totalMs };
}

/** Milliseconds left; Infinity when the caller passed no deadline. */
export function msLeft(deadline?: Deadline): number {
  return deadline ? deadline.at - Date.now() : Number.POSITIVE_INFINITY;
}

/** Whether there's still room for a step expected to take `needMs`. */
export function hasBudget(deadline?: Deadline, needMs = MIN_CALL_BUDGET_MS): boolean {
  return msLeft(deadline) >= needMs;
}

/** Per-request timeout, so one hung upstream call can't eat the whole turn. */
export function callTimeoutMs(deadline?: Deadline): number {
  const left = msLeft(deadline);
  if (!Number.isFinite(left)) return MAX_CALL_TIMEOUT_MS;
  return Math.max(5_000, Math.min(MAX_CALL_TIMEOUT_MS, left - 2_000));
}

/**
 * Request options for one upstream call: bounded by what's left of the turn and
 * never auto-retried. The SDK's default retry silently DOUBLES the wall clock
 * we just budgeted (a 150s timeout becomes 300s), and both pipelines already
 * have their own retry / fallback structure on top.
 */
export function callOptions(deadline?: Deadline): { timeout: number; maxRetries: number } {
  return { timeout: callTimeoutMs(deadline), maxRetries: 0 };
}
