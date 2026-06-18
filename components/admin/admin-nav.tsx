"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import {
  Home,
  ClipboardCheck,
  Library,
  Megaphone,
  Flag,
  ImagePlus,
  Wallet,
  Settings2,
  Footprints,
  type LucideIcon
} from "lucide-react";

type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

// Optional pending counts shown as a notification badge next to a nav item,
// keyed by the item's href.
export type AdminNavCounts = Partial<Record<string, number>>;

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
        label: "Home",
        icon: Home,
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
      },
      {
        href: "/admin/blogger-reviews",
        label: "Blogger reviews",
        icon: Megaphone,
        match: (p) => p.startsWith("/admin/blogger-reviews")
      },
      {
        href: "/admin/image-corrections",
        label: "Image corrections",
        icon: ImagePlus,
        match: (p) => p.startsWith("/admin/image-corrections")
      },
      {
        href: "/admin/reports",
        label: "Reported comments",
        icon: Flag,
        match: (p) => p.startsWith("/admin/reports")
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
      },
      {
        href: "/admin/settings",
        label: "Site settings",
        icon: Settings2,
        match: (p) => p.startsWith("/admin/settings")
      }
    ]
  },
  {
    label: "Tools",
    items: [
      {
        // Hidden feature — no public link. Admins reach it directly from here.
        href: "/foot-scan",
        label: "Foot Scan",
        icon: Footprints,
        match: (p) => p.startsWith("/foot-scan")
      }
    ]
  }
];

export function AdminNav({ counts = {} }: { counts?: AdminNavCounts }) {
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
            const count = counts[item.href] ?? 0;
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
                {count > 0 && (
                  <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-[rgb(var(--accent))] px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none text-[rgb(var(--bg))]">
                    {count > 99 ? "99+" : count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
