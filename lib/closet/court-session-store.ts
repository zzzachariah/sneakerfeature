"use client";

// Where a running court session lives between renders, reloads and force-quits.
//
// localStorage is the web's copy; the native Live Activity keeps its own. They
// are reconciled on every app resume (see court-session-provider.tsx) rather
// than kept in lockstep, because either side can start a session on its own —
// the closet page in the WebView, or the "开场" button on a home-screen widget
// while the app wasn't even running.

import type { CourtSession } from "@/lib/closet/court-session";
import { randomId } from "@/lib/utils";

const STORAGE_KEY = "sf:court-session";

/** Fired after the closet or a session changes, so the widget snapshot re-publishes. */
export const WIDGETS_REFRESH_EVENT = "sf:widgets-refresh";

export function requestWidgetRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(WIDGETS_REFRESH_EVENT));
}

function isSession(value: unknown): value is CourtSession {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<CourtSession>;
  return (
    typeof s.id === "string" &&
    typeof s.shoeId === "string" &&
    typeof s.shoeName === "string" &&
    typeof s.startedAt === "number" &&
    Number.isFinite(s.startedAt) &&
    (s.runningSince === null || (typeof s.runningSince === "number" && Number.isFinite(s.runningSince))) &&
    typeof s.accumulatedMs === "number" &&
    Number.isFinite(s.accumulatedMs)
  );
}

export function readStoredSession(): CourtSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isSession(parsed)) return null;
    // Normalize the optional fields so consumers never have to guard them.
    return {
      ...parsed,
      shoeBrand: typeof parsed.shoeBrand === "string" ? parsed.shoeBrand : "",
      imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : null
    };
  } catch {
    return null;
  }
}

export function writeStoredSession(session: CourtSession | null): void {
  if (typeof window === "undefined") return;
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / quota — the session still works for this page view */
  }
}

export function newSessionId(): string {
  return randomId("cs");
}
