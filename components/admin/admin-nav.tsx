"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import {
  LayoutDashboard,
  ClipboardCheck,
  Library,
  Wallet,
  type LucideIcon
} from "lucide-react";

type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

type NavGroup = {
  label: string | null;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      {
        href: "/admin",
        label: "Overview",
        icon: LayoutDashboard,
        match: (p) => p === "/admin"
      }
    ]
  },
  {
    label: "Content",
    items: [
      {
        href: "/admin/review",
        label: "Submission review",
        icon: ClipboardCheck,
        match: (p) => p.startsWith("/admin/review")
      },
      {
        href: "/admin/published",
        label: "Published records",
        icon: Library,
        match: (p) => p.startsWith("/admin/published")
      }
    ]
  },
  {
    label: "Operations",
    items: [
      {
        href: "/admin/credits",
        label: "Credits & balances",
        icon: Wallet,
        match: (p) => p.startsWith("/admin/credits")
      }
    ]
  }
];

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <nav className="space-y-5">
      {NAV_GROUPS.map((group, idx) => (
        <div key={group.label ?? `g-${idx}`} className="space-y-1">
          {group.label && (
            <p className="px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] soft-text">
              {group.label}
            </p>
          )}
          {group.items.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "flex items-center gap-2.5 rounded-lg border border-[rgb(var(--accent)/0.45)] bg-[rgb(var(--accent)/0.12)] px-3 py-2 text-sm font-medium text-[rgb(var(--accent))]"
                    : "flex items-center gap-2.5 rounded-lg border border-transparent px-3 py-2 text-sm transition hover:bg-[rgb(var(--muted)/0.3)]"
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
