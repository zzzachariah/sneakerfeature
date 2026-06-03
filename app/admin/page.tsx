import Link from "next/link";
import type { Route } from "next";
import {
  Home,
  ClipboardCheck,
  Library,
  Megaphone,
  Wallet,
  Settings2,
  ChevronRight,
  type LucideIcon
} from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminLogoutButton } from "@/components/admin/admin-logout-button";

type AdminSection = {
  href: Route;
  label: string;
  description: string;
  icon: LucideIcon;
};

const SECTIONS: AdminSection[] = [
  {
    href: "/admin/review",
    label: "Submission review",
    description: "Review, normalize, and publish user-submitted shoes.",
    icon: ClipboardCheck
  },
  {
    href: "/admin/published",
    label: "Published records",
    description: "Browse and edit every published shoe record.",
    icon: Library
  },
  {
    href: "/admin/blogger-reviews",
    label: "Blogger reviews",
    description: "Manage the 博主点评 cards shown on each shoe.",
    icon: Megaphone
  },
  {
    href: "/admin/credits",
    label: "Credits & balances",
    description: "Manually grant or reset user credit balances.",
    icon: Wallet
  },
  {
    href: "/admin/settings",
    label: "Site settings",
    description: "Smart Picker access, daily check-in credits, and bulk image import.",
    icon: Settings2
  }
];

export default async function AdminPage() {
  const admin = await requireAdminPageContext();

  return (
    <main className="container-shell space-y-4 py-6">
      <AdminPageHeader
        title="Admin console"
        description={`Signed in as ${admin.username}. Pick a section to manage.`}
        icon={Home}
        actions={<AdminLogoutButton />}
      />

      <nav className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          return (
            <Link
              key={section.href}
              href={section.href}
              className="surface-card premium-border group flex items-start gap-3 rounded-2xl p-4 transition hover:border-[rgb(var(--accent)/0.45)] hover:bg-[rgb(var(--muted)/0.15)]"
            >
              <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{section.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 soft-text transition group-hover:translate-x-0.5 group-hover:text-[rgb(var(--accent))]" />
                </span>
                <span className="mt-1 block text-sm soft-text">{section.description}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
