"use client";

import { useEffect } from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { NativeChrome, type NativeTab } from "@/components/native/native-chrome";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";

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

const TABS: Tab[] = [
  { key: "home", href: "/", label: "Home", symbol: "house", match: (p) => p === "/" || p.startsWith("/search") },
  { key: "compare", href: "/compare", label: "Compare", symbol: "square.on.square", match: (p) => p === "/compare" || p.startsWith("/compare/") },
  { key: "picker", href: "/smart-picker", label: "Picker", symbol: "sparkles", match: (p) => p === "/smart-picker" || p.startsWith("/smart-picker/") },
  { key: "submit", href: "/submit", label: "Submit", symbol: "plus.app", match: (p) => p === "/submit" || p.startsWith("/submit/") },
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
    const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;
    const nativeTabs: NativeTab[] = tabs.map((t) => ({ key: t.key, label: translate(t.label), symbol: t.symbol }));
    const active = tabs.find((t) => t.match(pathname))?.key;
    NativeChrome.configureTabBar({ tabs: nativeTabs, active })
      .then(() => document.documentElement.classList.add("native-tabbar-active"))
      .catch((err) => console.warn("[native-chrome] configureTabBar failed:", err));
    // pathname intentionally excluded — the separate effect below keeps the
    // active item in sync without rebuilding the whole bar on every navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, translate]);

  // Tab tap (native) → navigate the web view.
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    let remove: (() => void) | undefined;
    void (async () => {
      const handle = await NativeChrome.addListener("tabSelected", ({ key }) => {
        const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;
        const href = tabs.find((t) => t.key === key)?.href;
        if (href) router.push(href);
      });
      remove = () => void handle.remove();
    })();
    return () => remove?.();
  }, [isAdmin, router]);

  // Route change → highlight the matching tab.
  useEffect(() => {
    if (!nativeBarAvailable()) return;
    const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;
    const active = tabs.find((t) => t.match(pathname))?.key;
    if (active) void NativeChrome.setActiveTab({ key: active });
  }, [pathname, isAdmin]);

  return null;
}
