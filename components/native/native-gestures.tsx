"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { NativeChrome } from "@/components/native/native-chrome";
import { haptics } from "@/lib/native/haptics";

// Drives the native iOS pull-to-refresh: a UIRefreshControl on the web scroll
// view fires `pullRefresh`, which we turn into a router.refresh() (re-runs the
// server components) plus a haptic. Edge-swipe-back needs nothing here — it's
// handled entirely natively via allowsBackForwardNavigationGestures.
//
// It's disabled on routes that run their own swipe/wheel deck (shoe detail, the
// smart-picker chat), where a downward pull at the top would fight those
// gestures. Everywhere else (home feed, dashboard, compare, search…) a pull at
// the top refreshes. On non-iOS / web this renders nothing.
const nativeAvailable = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios" &&
  Capacitor.isPluginAvailable("NativeChrome");

const NO_REFRESH_PREFIXES = ["/shoes/", "/smart-picker", "/foot-scan"];

export function NativePullToRefresh() {
  const pathname = usePathname();
  const router = useRouter();

  // Refresh when the native control is pulled.
  useEffect(() => {
    if (!nativeAvailable()) return;
    let remove: (() => void) | undefined;
    void (async () => {
      const handle = await NativeChrome.addListener("pullRefresh", () => {
        haptics.gesture();
        router.refresh();
      });
      remove = () => void handle.remove();
    })();
    return () => remove?.();
  }, [router]);

  // Enable/disable per route so it never overlaps a deck page's own gestures.
  useEffect(() => {
    if (!nativeAvailable()) return;
    const blocked = NO_REFRESH_PREFIXES.some((p) => pathname.startsWith(p));
    void NativeChrome.setPullToRefreshEnabled({ enabled: !blocked }).catch(() => {});
  }, [pathname]);

  return null;
}
