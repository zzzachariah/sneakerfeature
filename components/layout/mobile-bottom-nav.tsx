"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GitCompare, Home, Plus, Shield, Sparkles, UserCircle } from "lucide-react";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { useLocale } from "@/components/i18n/locale-provider";

type Tab = {
  href: "/" | "/compare" | "/smart-picker" | "/submit" | "/dashboard" | "/admin";
  label: string;
  icon: typeof Home;
  match: (pathname: string) => boolean;
};

const TABS: Tab[] = [
  {
    href: "/",
    label: "Home",
    icon: Home,
    // Note: shoe detail (/shoes/*) intentionally matches no tab, so the bottom
    // nav shows no active tab there.
    match: (p) => p === "/" || p.startsWith("/search"),
  },
  {
    href: "/compare",
    label: "Compare",
    icon: GitCompare,
    match: (p) => p === "/compare" || p.startsWith("/compare/"),
  },
  {
    href: "/smart-picker",
    label: "Picker",
    icon: Sparkles,
    match: (p) => p === "/smart-picker" || p.startsWith("/smart-picker/"),
  },
  {
    href: "/submit",
    label: "Submit",
    icon: Plus,
    match: (p) => p === "/submit" || p.startsWith("/submit/"),
  },
  {
    href: "/dashboard",
    label: "Account",
    icon: UserCircle,
    match: (p) =>
      p === "/dashboard" ||
      p.startsWith("/dashboard/") ||
      p === "/login" ||
      p === "/signup" ||
      p === "/register",
  },
];

const ADMIN_TAB: Tab = {
  href: "/admin",
  label: "Admin",
  icon: Shield,
  match: (p) => p === "/admin" || p.startsWith("/admin/"),
};

export function MobileBottomNav() {
  const pathname = usePathname();
  const { isAdmin, signedIn } = useAuthState();
  const { translate } = useLocale();

  const tabs = isAdmin ? [...TABS, ADMIN_TAB] : TABS;
  const activeIdx = tabs.findIndex((t) => t.match(pathname));

  return (
    // Full-width wrapper is click-through; only the centered capsule is interactive.
    <nav
      aria-label="Primary mobile navigation"
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-2 md:hidden"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 5px)" }}
      data-no-translate="true"
    >
      <ul className="glass glass-refract glass-rim pointer-events-auto relative flex h-[60px] items-center gap-0.5 rounded-full px-2">
        {tabs.map((tab, i) => {
          const active = i === activeIdx;
          const Icon = tab.icon;
          const showSignedDot = tab.href === "/dashboard" && signedIn;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex h-[52px] w-[52px] select-none flex-col items-center justify-center gap-[3px] rounded-2xl transition-colors duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  active ? "text-[rgb(var(--text))]" : "text-[rgb(var(--subtext))] hover:text-[rgb(var(--text))]"
                }`}
              >
                {/* Selected-tab indicator — a small dot above the icon (no
                    background slab, so the icon + label keep their breathing
                    room and never sit cramped against an edge). */}
                <span
                  aria-hidden
                  className="absolute top-[6px] left-1/2 h-[5px] w-[5px] -translate-x-1/2 rounded-full bg-[rgb(var(--text))] transition-[transform,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    opacity: active ? 1 : 0,
                    transform: `translateX(-50%) scale(${active ? 1 : 0})`
                  }}
                />
                <span
                  className="relative inline-flex h-6 w-6 items-center justify-center transition-transform duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-active:scale-[0.9]"
                  style={{ transform: active ? "translateY(1px)" : "none" }}
                >
                  <Icon className="h-[20px] w-[20px]" strokeWidth={active ? 2.2 : 1.7} />
                  {showSignedDot && !active ? (
                    <span
                      aria-hidden
                      className="absolute right-[1px] top-[1px] h-1.5 w-1.5 rounded-full bg-[rgb(var(--text))] ring-2 ring-[rgb(var(--bg))]"
                    />
                  ) : null}
                </span>
                <span
                  className={`relative text-[0.6rem] leading-none tracking-[0.02em] transition-[font-weight] ${
                    active ? "font-semibold" : "font-medium"
                  }`}
                >
                  {translate(tab.label)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
