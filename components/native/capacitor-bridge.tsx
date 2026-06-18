"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";

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

      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("backButton", ({ canGoBack }) => {
          if (canGoBack) {
            window.history.back();
          } else {
            void App.exitApp();
          }
        });
        if (disposed) handle.remove();
        else cleanups.push(() => handle.remove());
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
