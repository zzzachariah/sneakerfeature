// Resolving inbound deep links to an in-app path.
//
// The native shell receives these through Capacitor's `appUrlOpen` event: a
// custom-scheme tap ("sneakerfeature://subscribe"), or a universal/app link if
// one is ever configured. The main caller is the return-from-checkout button on
// /subscribe/complete — see components/native/capacitor-bridge.tsx.
//
// Kept import-free so it stays a pure, testable unit: scripts/test-deep-link.mts.

/** Custom URL scheme registered by the native shell (see MOBILE.md). */
export const APP_URL_SCHEME = "sneakerfeature";

/**
 * Turns an inbound deep link into a same-origin path to navigate the WebView
 * to, or null if it isn't one we should follow.
 *
 * A deep link is attacker-reachable input — any app, web page, or QR code can
 * hand us one — so the result is only ever a plain "/path": anything that could
 * resolve against a different origin ("//evil.com", "/\\evil.com") is rejected
 * rather than sanitized, and so is any scheme that isn't ours or http(s).
 */
export function pathFromDeepLink(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const scheme = parsed.protocol.replace(/:$/, "").toLowerCase();
  const isWebLink = scheme === "http" || scheme === "https";
  if (!isWebLink && scheme !== APP_URL_SCHEME) return null;

  // A custom scheme puts the first segment in `host`, not `pathname`
  // ("sneakerfeature://subscribe/complete" → host "subscribe", pathname
  // "/complete"), so stitch them back together. Web links already carry the
  // whole path in `pathname`, and their `host` is our domain — not a segment.
  const path = isWebLink
    ? `${parsed.pathname}${parsed.search}`
    : `/${parsed.host}${parsed.pathname}${parsed.search}`;

  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}
