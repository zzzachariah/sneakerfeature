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
// In the iOS app the script instead adds the `native-tabbar-boot` /
// `native-topbar-boot` classes, which hide the web bottom nav and header from
// the very first frame — the native Liquid Glass bars own those surfaces, and
// they persist across WebView reloads, so without the boot classes every full
// reload (e.g. pull-to-refresh) flashed the web bars underneath them until
// NativeBottomNav/NativeTopBar confirmed the native chrome and added the
// -active classes. The boot hide is provisional: if the NativeChrome plugin
// turns out to be missing or its configure call fails, those components remove
// the boot class and the web bars return as the fallback (see
// native-bottom-nav.tsx / native-top-bar.tsx).
//
// Platform comes from the WebView User-Agent: both Capacitor shells append
// "sneakerfeature-mobile" (iOS + Android) and the Electron shell appends
// "sneakerfeature-desktop" (see capacitor.config.ts / electron/main.js). The
// iOS native app is therefore "the mobile shell that is not Android". Mobile
// Safari and every other browser carry no marker, so they count as web and get
// the clean skin too.
//
// Fail-safe: the catch is intentionally empty. If anything throws, no marker or
// boot class is set — nothing is de-glassed and no bar is hidden, so both the
// iOS app and the web can never accidentally change.
export function SkinInitScript({ nonce }: { nonce?: string }) {
  const code = `(() => { try { var ua = navigator.userAgent || ""; var iosApp = /sneakerfeature-mobile/.test(ua) && !/android/i.test(ua); if (!iosApp) { document.documentElement.setAttribute('data-skin', 'clean'); } else { document.documentElement.classList.add('native-tabbar-boot', 'native-topbar-boot'); } } catch (e) {} })();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
