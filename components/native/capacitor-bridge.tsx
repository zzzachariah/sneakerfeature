"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { consumeCheckoutPending, isInAppBrowserOpen, markInAppBrowserClosed } from "@/lib/native/checkout";
import { pathFromDeepLink } from "@/lib/native/deep-link";

// Runs once on the client. When the web app is loaded inside the Capacitor
// native shell (iOS/Android) it wires up the native chrome: it marks the
// document so CSS can adapt to the native environment, styles the status bar to
// match the dark ambient background, hides the launch splash once the remote
// site is interactive, and makes the Android hardware back button behave.
//
// In a normal browser every branch is skipped, so this renders nothing and has
// no effect. Plugins are imported lazily to keep them out of the SSR bundle.
export function CapacitorBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    const root = document.documentElement;
    root.classList.add("capacitor-native");
    root.dataset.nativePlatform = Capacitor.getPlatform();

    void (async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        await StatusBar.setStyle({ style: Style.Dark });
        if (Capacitor.getPlatform() === "android") {
          await StatusBar.setBackgroundColor({ color: "#0a0a0a" });
        }
      } catch {
        /* status bar plugin unavailable */
      }

      // The native splash is configured with launchAutoHide:false (see
      // capacitor.config.ts) so it stays up until the remote page is on screen
      // instead of vanishing on a fixed timer and exposing a black WebView while
      // a slow network finishes loading. This effect runs after the (already
      // server-rendered) page has painted, so hiding here drops the splash the
      // moment there is real content. The timeout is a safety net: if anything
      // stalls, the user is never trapped behind the splash forever.
      try {
        const { SplashScreen } = await import("@capacitor/splash-screen");
        const fallback = setTimeout(() => {
          void SplashScreen.hide();
        }, 5000);
        cleanups.push(() => clearTimeout(fallback));
        await SplashScreen.hide();
        clearTimeout(fallback);
      } catch {
        /* splash plugin unavailable */
      }

      // Refresh the page the user left behind when they come back from Stripe
      // checkout. Without this the WebView still shows the pre-purchase
      // /subscribe page and a member who just paid reads as "free" until they
      // think to pull-to-refresh. consumeCheckoutPending() is a one-shot latch,
      // so whichever return signal lands first does the reload.
      const returnFromCheckout = () => {
        if (consumeCheckoutPending()) window.location.reload();
      };

      try {
        const { Browser } = await import("@capacitor/browser");
        // The in-app checkout browser was dismissed ("Done"), whether the
        // purchase went through or was abandoned. Reloading either way also
        // clears the subscribe page's pending button state.
        const handle = await Browser.addListener("browserFinished", () => {
          markInAppBrowserClosed();
          returnFromCheckout();
        });
        if (disposed) handle.remove();
        else cleanups.push(() => handle.remove());
      } catch {
        /* browser plugin unavailable */
      }

      try {
        const { App } = await import("@capacitor/app");
        const handles = [
          await App.addListener("backButton", ({ canGoBack }) => {
            if (canGoBack) {
              window.history.back();
            } else {
              void App.exitApp();
            }
          }),

          // Covers the checkout paths that never fire browserFinished: an older
          // shell without the Browser plugin (checkout opened in the system
          // browser), or a wallet hand-off that bounced the user out to
          // Alipay / WeChat and back. Skipped while the in-app browser is up —
          // there the app also "resumes" mid-payment, and reloading then would
          // burn the latch before the purchase completed.
          await App.addListener("appStateChange", ({ isActive }) => {
            if (!isActive || isInAppBrowserOpen()) return;
            returnFromCheckout();
          }),

          // "Back to the app" links (custom scheme / universal link). Stripe's
          // redirect chain can't wake the app on its own — only a real tap can,
          // which is what the button on /subscribe/complete is for.
          await App.addListener("appUrlOpen", ({ url }) => {
            const path = pathFromDeepLink(url);
            // Not a link we can resolve: do nothing at all. Leaving the pending
            // latch untouched matters — burning it here would cost a genuine
            // checkout its refresh when the browser is dismissed later.
            if (!path) return;
            void (async () => {
              try {
                const { Browser } = await import("@capacitor/browser");
                await Browser.close();
              } catch {
                /* nothing presented, or plugin unavailable */
              }
              markInAppBrowserClosed();
              // The deep link IS the return, so drop the latch and navigate —
              // assign() re-requests even the current path, so the server
              // render that lands already reflects the new membership.
              consumeCheckoutPending();
              window.location.assign(path);
            })();
          })
        ];
        if (disposed) handles.forEach((h) => h.remove());
        else cleanups.push(() => handles.forEach((h) => h.remove()));
      } catch {
        /* app plugin unavailable */
      }
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);

  return null;
}
