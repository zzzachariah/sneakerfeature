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
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
