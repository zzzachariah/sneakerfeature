// Handing off to Stripe's hosted checkout from inside the native app.
//
// Why this exists: the Capacitor shell loads snkrfeature.com in a WebView with
// no `allowNavigation` entries (see capacitor.config.ts), so a plain
// `location.assign("https://checkout.stripe.com/…")` is cancelled by the
// navigation delegate and punted to the *system* browser — the user leaves the
// app entirely, and nothing brings them back. Instead we open checkout in the
// in-app browser (SFSafariViewController on iOS, Custom Tabs on Android), which
// the user can dismiss with a single tap to land straight back in the app.
//
// Returning is only half of it: the WebView underneath still shows the
// pre-purchase page, so membership would read as stale ("I paid and I'm still
// on free"). We drop a session-scoped breadcrumb when checkout opens and
// CapacitorBridge reloads once the user comes back — see components/native/
// capacitor-bridge.tsx.
import { isNativeApp } from "@/lib/native/native";

const PENDING_KEY = "sf:checkout-pending";

// True while the in-app browser is presented. Kept in module scope (not
// sessionStorage) because it must NOT survive a reload — it describes the
// current native presentation, not the purchase.
let inAppBrowserOpen = false;

export function isInAppBrowserOpen(): boolean {
  return inAppBrowserOpen;
}

export function markInAppBrowserClosed(): void {
  inAppBrowserOpen = false;
}

/**
 * Reads and clears the "a checkout was opened from this tab" breadcrumb.
 * Returns true at most once per checkout hand-off, so whichever return signal
 * fires first (browser dismissed, app resumed, deep link) does the refresh and
 * the others no-op.
 */
export function consumeCheckoutPending(): boolean {
  try {
    if (sessionStorage.getItem(PENDING_KEY) !== "1") return false;
    sessionStorage.removeItem(PENDING_KEY);
    return true;
  } catch {
    // Private mode / storage disabled — no breadcrumb, no auto-refresh.
    return false;
  }
}

export type CheckoutHandoff = "in-app-browser" | "navigated";

/**
 * Sends the user to a Stripe hosted checkout URL.
 *
 * Web: a normal same-tab navigation. Native: the in-app browser, so the app
 * stays alive underneath and dismissal returns the user in one tap. Falls back
 * to navigation if the Browser plugin is missing (older shell build) — the
 * system browser is worse, but it still completes the purchase.
 *
 * @returns how the hand-off happened, so callers know whether the current page
 *   is going away ("navigated") or still on screen behind the browser.
 */
export async function openCheckout(url: string): Promise<CheckoutHandoff> {
  if (!isNativeApp()) {
    window.location.assign(url);
    return "navigated";
  }

  try {
    sessionStorage.setItem(PENDING_KEY, "1");
  } catch {
    /* storage disabled — the user can still refresh by hand */
  }

  try {
    const { Browser } = await import("@capacitor/browser");
    inAppBrowserOpen = true;
    await Browser.open({ url, presentationStyle: "fullscreen" });
    return "in-app-browser";
  } catch {
    inAppBrowserOpen = false;
    window.location.assign(url);
    return "navigated";
  }
}
