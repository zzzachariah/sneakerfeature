// Deep-link resolution for the native shell — the guard that decides where an
// inbound `appUrlOpen` URL is allowed to navigate the WebView. Pure function,
// no database, no env: runnable any time.
//
//   npx tsx scripts/test-deep-link.mts
//
// Why this has its own test: the input is attacker-reachable (any app, web
// page, or QR code can hand the shell a URL), so a parsing slip here is an
// open redirect that navigates the logged-in WebView to someone else's origin.

import { APP_URL_SCHEME, pathFromDeepLink } from "../lib/native/deep-link";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}`, extra ?? "");
  }
}

function expectPath(raw: string, expected: string | null) {
  const actual = pathFromDeepLink(raw);
  check(`${raw} → ${expected === null ? "null" : expected}`, actual === expected, `got ${actual}`);
}

console.log("\ncustom scheme — the return-from-checkout path");
// The button on /subscribe/complete. The first segment lands in URL.host, not
// URL.pathname, which is the whole reason this helper exists.
expectPath(`${APP_URL_SCHEME}://subscribe`, "/subscribe");
expectPath(`${APP_URL_SCHEME}://subscribe/complete`, "/subscribe/complete");
expectPath(`${APP_URL_SCHEME}://subscribe/complete?session_id=cs_123&app=1`, "/subscribe/complete?session_id=cs_123&app=1");
expectPath(`${APP_URL_SCHEME}://`, "/");

console.log("\nweb links (universal / app links)");
expectPath("https://snkrfeature.com/subscribe", "/subscribe");
expectPath("https://snkrfeature.com/subscribe/complete?session_id=cs_1", "/subscribe/complete?session_id=cs_1");
expectPath("https://snkrfeature.com", "/");
expectPath("http://snkrfeature.com/shoes/abc", "/shoes/abc");

console.log("\nrejected — must never navigate the WebView off our origin");
// A URL whose path resolves against another host. "//evil.com" is the classic:
// browsers read it as protocol-relative, so location.assign would leave the site.
expectPath(`${APP_URL_SCHEME}:////evil.com`, null);
// Foreign schemes: another app's deep link is not ours to follow.
expectPath("javascript:alert(1)", null);
expectPath("data:text/html,<script>alert(1)</script>", null);
expectPath("file:///etc/passwd", null);
expectPath("otherapp://subscribe", null);
// Not a URL at all.
expectPath("not a url", null);
expectPath("", null);
expectPath("/subscribe", null);

console.log("\nscheme matching is case-insensitive (iOS may normalize)");
expectPath(`${APP_URL_SCHEME.toUpperCase()}://subscribe`, "/subscribe");

console.log("\nhost-spoofing shapes resolve to a harmless same-origin path");
// A "host" that looks like someone else's domain is only ever read as a path
// segment, and userinfo tricks ("evil.com\@x" — real host is "x") can't smuggle
// an origin through either, because we never reuse the parsed host as a host.
expectPath(`${APP_URL_SCHEME}://evil.com`, "/evil.com");
expectPath(`${APP_URL_SCHEME}://@evil.com`, "/evil.com");
expectPath(`${APP_URL_SCHEME}://evil.com\\@x`, "/x");

console.log("\ninvariant — every accepted link stays on our origin");
// The property that actually matters, checked directly rather than inferred
// from the cases above: whatever comes back, resolving it against the site must
// land on the site. Guards against a future parser tweak reopening a redirect.
const ORIGIN = "https://snkrfeature.com";
const HOSTILE = [
  `${APP_URL_SCHEME}://evil.com`,
  `${APP_URL_SCHEME}://@evil.com`,
  `${APP_URL_SCHEME}://evil.com\\@x`,
  `${APP_URL_SCHEME}:////evil.com`,
  `${APP_URL_SCHEME}:///\\evil.com`,
  `${APP_URL_SCHEME}://subscribe/../../etc`,
  `${APP_URL_SCHEME}://user:pw@evil.com/subscribe`,
  "https://evil.com/subscribe",
  "//evil.com",
  "\\\\evil.com",
  "javascript:alert(1)"
];
for (const raw of HOSTILE) {
  const path = pathFromDeepLink(raw);
  const stays = path === null || new URL(path, ORIGIN).origin === ORIGIN;
  check(`${raw} stays on ${ORIGIN}`, stays, `resolved to ${path && new URL(path, ORIGIN).href}`);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
