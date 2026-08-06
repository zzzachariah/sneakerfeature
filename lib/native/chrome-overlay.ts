"use client";

// Who owns the native chrome while a modal is open.
//
// The iOS shell's tab bar, nav bar, search field, FAB and back button are real
// UIKit views that Swift adds as SIBLINGS on top of the WKWebView (see
// NativeTabBarController.attach). Nothing the web layer draws can reach them:
// a full-screen backdrop-filter blurs the page and stops dead at the edge of
// the web view, leaving those bars pin-sharp over a blurred screen. That is the
// "有一些看不清" the receipt sheet showed — not a missing blur, but chrome the
// blur physically cannot cover.
//
// So the web asks the shell to step aside for the duration of the overlay. The
// catch is restoring afterwards: each surface's visibility is decided by a
// different component's effect (the FAB by the home feed's scroll position, the
// back button by the detail route), and those effects don't re-run just because
// a sheet closed. Un-hiding everything would resurrect a FAB on a page that
// never had one.
//
// Hence this module: it is the single writer for those five setters. Callers
// declare what they WANT visible; overlays are counted, not toggled; and the
// resolved value is `wanted && no overlay is open`. Closing the last sheet
// replays each surface's own last intent, whatever it happened to be.
//
// Every entry point is a no-op off iOS, or when the plugin didn't load.

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { NativeChrome } from "@/components/native/native-chrome";

export type NativeSurface = "tabBar" | "navBar" | "search" | "fab" | "back";

const SURFACES: NativeSurface[] = ["tabBar", "navBar", "search", "fab", "back"];

const SETTERS: Record<NativeSurface, (visible: boolean) => Promise<unknown>> = {
  tabBar: (visible) => NativeChrome.setVisible({ visible }),
  navBar: (visible) => NativeChrome.setNavBarVisible({ visible }),
  search: (visible) => NativeChrome.setSearchVisible({ visible }),
  fab: (visible) => NativeChrome.setFabVisible({ visible }),
  back: (visible) => NativeChrome.setBackVisible({ visible })
};

// The two bars are raised once by configureTabBar / configureNavBar and then
// left up for the life of the app, so they start "wanted". The three floating
// surfaces are opt-in per route and start down.
const wanted: Record<NativeSurface, boolean> = {
  tabBar: true,
  navBar: true,
  search: false,
  fab: false,
  back: false
};

let overlays = 0;

const available = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios" &&
  Capacitor.isPluginAvailable("NativeChrome");

/** Push one surface's resolved visibility down to Swift. */
function apply(surface: NativeSurface): void {
  if (!available()) return;
  const visible = overlays === 0 && wanted[surface];
  void SETTERS[surface](visible).catch(() => {
    /* Surface not configured on this route — nothing to show or hide. */
  });
}

function applyAll(): void {
  for (const surface of SURFACES) apply(surface);
}

/**
 * Declare whether a surface should be up. Use this instead of calling the
 * plugin's set*Visible directly, so the value survives an overlay opening and
 * closing over it.
 */
export function setNativeSurface(surface: NativeSurface, visible: boolean): void {
  wanted[surface] = visible;
  apply(surface);
}

/** An overlay opened. Counted, so nested sheets don't restore each other early. */
export function pushNativeOverlay(): void {
  overlays += 1;
  if (overlays === 1) applyAll();
}

export function popNativeOverlay(): void {
  overlays = Math.max(0, overlays - 1);
  if (overlays === 0) applyAll();
}

/**
 * Hide the native chrome for as long as `open` is true, so a full-screen
 * backdrop actually covers the full screen. The cleanup runs on unmount too —
 * an overlay whose parent route is torn down mid-animation still gives the
 * chrome back.
 */
export function useNativeChromeOverlay(open: boolean): void {
  useEffect(() => {
    if (!open) return;
    pushNativeOverlay();
    return () => popNativeOverlay();
  }, [open]);
}
