"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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

  const [animateIdx, setAnimateIdx] = useState(activeIdx);
  useEffect(() => {
    // Track activeIdx even when it's -1 (no tab) so the indicator pill hides on
    // pages that aren't one of the tabs (e.g. a shoe detail page).
    setAnimateIdx(activeIdx);
  }, [activeIdx]);

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--bg)/0.86)] backdrop-blur-[18px] backdrop-saturate-[180%]"
      data-no-translate="true"
    >
      <ul
        className="relative grid h-14"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {/* Animated active indicator pill */}
        {animateIdx >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 h-[2px] rounded-full bg-[rgb(var(--text))] transition-[left,width] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{
              width: `calc(100% / ${tabs.length} - 36px)`,
              left: `calc(${animateIdx} * (100% / ${tabs.length}) + 18px)`,
            }}
          />
        )}

        {tabs.map((tab, i) => {
          const active = i === activeIdx;
          const Icon = tab.icon;
          const showSignedDot = tab.href === "/dashboard" && signedIn;
          return (
            <li key={tab.href} className="contents">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`group relative flex h-full select-none flex-col items-center justify-center gap-[3px] text-[rgb(var(--subtext))] transition-colors duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                  active ? "text-[rgb(var(--text))]" : "hover:text-[rgb(var(--text))]"
                }`}
              >
                <span
                  className="relative inline-flex h-6 w-6 items-center justify-center transition-transform duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-active:scale-[0.92]"
                  style={{ transform: active ? "translateY(-1px)" : "none" }}
                >
                  <Icon
                    className="h-[20px] w-[20px]"
                    strokeWidth={active ? 2.2 : 1.7}
                  />
                  {showSignedDot && !active ? (
                    <span
                      aria-hidden
                      className="absolute right-[1px] top-[1px] h-1.5 w-1.5 rounded-full bg-[rgb(var(--text))] ring-2 ring-[rgb(var(--bg))]"
                    />
                  ) : null}
                </span>
                <span
                  className={`text-[0.62rem] font-medium leading-none tracking-[0.02em] transition-opacity duration-200 ${
                    active ? "" : "opacity-90"
                  }`}
                >
                  {translate(tab.label)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {/* Brand wordmark tucked into the home-indicator safe area below the tabs. */}
      <div
        className="flex items-center justify-center overflow-hidden"
        style={{ height: "env(safe-area-inset-bottom, 0px)" }}
      >
        <span className="select-none text-[0.5rem] font-semibold uppercase tracking-[0.25em] text-[rgb(var(--subtext)/0.5)]">
          sneakerfeature
        </span>
      </div>
    </nav>
  );
}
