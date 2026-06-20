// Infers the direction of a client navigation so the page transition can slide the
// right way (forward = in from the right, back = in from the left), iOS-style.
//
// How: a single popstate listener flags the *next* resolve as a "back" — browser
// back/forward, the Android hardware back button (CapacitorBridge calls
// history.back()), and the iOS edge-swipe all dispatch popstate before React
// re-renders the template, so by the time <PageTransition> reads the direction the
// flag is set. Everything else (Link clicks, router.push) is a "forward". The very
// first resolve after load is "initial" so a cold start just fades — no slide.

type Direction = "forward" | "back" | "initial";

let initialized = false;
let firstResolved = false;
let popBack = false;

function ensureListener() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("popstate", () => {
    popBack = true;
  });
}

/**
 * Returns the direction for the navigation that just mounted a new template, and
 * consumes the back flag. Call exactly once per <PageTransition> mount.
 */
export function consumeRouteDirection(): Direction {
  ensureListener();
  if (!firstResolved) {
    firstResolved = true;
    return "initial";
  }
  if (popBack) {
    popBack = false;
    return "back";
  }
  return "forward";
}
