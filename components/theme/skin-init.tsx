// Pre-paint skin selector. Renders a blocking inline <script> that runs BEFORE
// first paint (same pattern as ThemeInitScript) so the surface treatment is
// decided with no flash.
//
// Every surface EXCEPT the iOS native app gets data-skin="clean", which swaps
// the Liquid Glass material for solid, simple surfaces (see globals.css). The
// iOS native app is deliberately left WITHOUT the marker, so its WebView keeps
// the original Liquid Glass — it loads the same web content as the site, and
// that experience must stay byte-for-byte unchanged.
//
// Platform comes from the WebView User-Agent: both Capacitor shells append
// "sneakerfeature-mobile" (iOS + Android) and the Electron shell appends
// "sneakerfeature-desktop" (see capacitor.config.ts / electron/main.js). The
// iOS native app is therefore "the mobile shell that is not Android". Mobile
// Safari and every other browser carry no marker, so they count as web and get
// the clean skin too.
//
// Fail-safe: the catch is intentionally empty. If anything throws, no marker is
// set and nothing is de-glassed, so the iOS app can never accidentally change.
export function SkinInitScript() {
  const code = `(() => { try { var ua = navigator.userAgent || ""; var iosApp = /sneakerfeature-mobile/.test(ua) && !/android/i.test(ua); if (!iosApp) document.documentElement.setAttribute('data-skin', 'clean'); } catch (e) {} })();`;
  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
