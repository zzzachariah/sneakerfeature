"use client";

import { useEffect, useMemo } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { NativeChrome, type NativeTab } from "@/components/native/native-chrome";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { haptics } from "@/lib/native/haptics";

// Drives the native iOS glass tab bar (see /native-chrome). On every other
// platform this renders nothing and never touches the plugin — the web
// `MobileBottomNav` stays in charge there. The tab list mirrors
// components/layout/mobile-bottom-nav.tsx; `symbol` is an SF Symbol name.
type Tab = {
  key: string;
  href: Route;
  label: string;
  symbol: string;
  match: (pathname: string) => boolean;
};

// Five tabs, because a tab bar is for the places you return to, not a menu of
// everything the app can do. Submit and Membership moved to the account menu:
// you post a shoe or buy a plan a handful of times ever, and both were costing
// a permanent slot. The closet took one of them — it's where the court timer
// lives, so it's now somewhere you open mid-session, one-handed.
const TABS: Tab[] = [
  { key: "home", href: "/", label: "Home", symbol: "house", match: (p) => p === "/" || p.startsWith("/search") },
  { key: "compare", href: "/compare", label: "Compare", symbol: "square.on.square", match: (p) => p === "/compare" || p.startsWith("/compare/") },
  { key: "picker", href: "/smart-picker", label: "Picker", symbol: "sparkles", match: (p) => p === "/smart-picker" || p.startsWith("/smart-picker/") },
  // "bag" rather than one of the shoe symbols: those only exist in SF Symbols 6
  // (iOS 18) and render as a blank box below it. Matches the bag the closet's
  // own empty state already uses.
  { key: "closet", href: "/closet", label: "My closet", symbol: "bag", match: (p) => p === "/closet" || p.startsWith("/closet/") },
  {
    key: "account",
    href: "/dashboard",
    label: "Account",
    symbol: "person.crop.circle",
    match: (p) =>
      p === "/dashboard" || p.startsWith("/dashboard/") || p === "/login" || p === "/signup" || p === "/register"
  }
];

const ADMIN_TAB: Tab = {
  key: "admin",
  href: "/admin",
  label: "Admin",
  symbol: "shield",
  match: (p) => p === "/admin" || p.startsWith("/admin/")
};

function buildTabs(isAdmin: boolean): Tab[] {
  const tabs = [...TABS];
  if (isAdmin) tabs.push(ADMIN_TAB);
  return tabs;
}

// Only treat the native bar as usable when we're in the iOS app AND the plugin
// actually loaded (pod synced + built). Otherwise we leave the web nav alone so
// the user is never left without a bottom bar.
const nativeBarAvailable = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.getPlatform() === "ios" &&
  Capacitor.isPluginAvailable("NativeChrome");

export function NativeBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { translate } = useLocale();
  const { isAdmin } = useAuthState();
  const tabs = useMemo(() => buildTabs(isAdmin), [isAdmin]);

  // Build / rebuild the native bar whenever its contents change (admin gate,
  // language). Only after configureTabBar resolves do we hide the web nav (via
  // the `native-tabbar-active` class) — so a missing/broken plugin leaves the
  // web nav in place instead of removing the bar entirely.
  useEffect(() => {
    if (!nativeBarAvailable()) {
      // Helpful breadcrumb in the Xcode/Safari console when running in-app.
      if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios") {
        console.warn("[native-chrome] NativeChrome plugin not available — keeping the web nav. Did `npx cap sync ios` list it?");
      }
      return;
    }
    const nativeTabs: NativeTab[] = tabs.map((t) => ({ key: t.key, label: translate(t.label), symbol: t.symbol }));
    const active = tabs.find((t) => t.match(pathname))?.key;
    NativeChrome.configureTabBar({ tabs: nativeTabs, active })
      .then(() => document.documentElement.classList.add("native-tabbar-active"))
      .catch((err) => console.warn("[native-chrome] configureTabBar failed:", err));
    // pathname intentionally excluded — the separate effect below keeps the
    // active item in sync without rebuilding the whole bar on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs, translate]);

  // Warm the router cache for every tab destination. The web navs get this for
  // free from <Link> prefetching; the native bar navigates via router.push, so
  // without this each first tap paid a completely cold fetch.
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    for (const t of tabs) router.prefetch(t.href);
  }, [tabs, router]);

  // Tab tap (native) → navigate the web view.
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    let remove: (() => void) | undefined;
    void (async () => {
      const handle = await NativeChrome.addListener("tabSelected", ({ key }) => {
        haptics.selection();
        const href = tabs.find((t) => t.key === key)?.href;
        if (href) router.push(href);
      });
      remove = () => void handle.remove();
    })();
    return () => remove?.();
  }, [tabs, router]);

  // Route change → highlight the matching tab.
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    const active = tabs.find((t) => t.match(pathname))?.key;
    if (active) void NativeChrome.setActiveTab({ key: active });
  }, [pathname, tabs]);

  return null;
}
