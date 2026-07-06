"use client";

import { useEffect } from "react";

// Registers the service worker (public/sw.js) for faster repeat loads + offline
// resilience. Fully guarded and browser-only, so it no-ops where service workers
// aren't supported. Notes:
//   • All web browsers + the Android WebView run it directly.
//   • The iOS app (WKWebView) only runs service workers when the loaded domain is
//     configured as an app-bound domain (WKAppBoundDomains in Info.plist) — see
//     MOBILE.md. Until then this is a harmless no-op in the iOS app, and iOS
//     Safari (PWA) still gets it.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration unsupported / blocked — ignore */
      });
    };
    // No forced reload on SW activation. The old updatefound → reload() handler
    // hard-reloaded whatever page the user was on every time a deploy shipped a
    // new sw.js — in the Capacitor WebView that reload of a dynamic page shows a
    // long blank screen and reads as the app freezing. sw.js uses skipWaiting +
    // clients.claim, and its caching is conservative (network-first navigations,
    // RSC/API passthrough), so the new worker safely takes over in place and
    // fresh content arrives with the next navigation anyway.
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
