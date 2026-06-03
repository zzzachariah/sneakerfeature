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
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminLogoutButton } from "@/components/admin/admin-logout-button";

type MetricCard = {
  href: Route;
  label: string;
  description: string;
  icon: LucideIcon;
  count: number | null;
};

async function loadCounts() {
  const admin = createAdminClient();
  if (!admin) {
    return { pending: null, published: null, bloggerReviews: null, balances: null };
  }
  const [pending, published, bloggerReviews, balances] = await Promise.all([
    admin
      .from("user_submissions")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "normalized", "draft"]),
    admin.from("shoes").select("id", { count: "exact", head: true }).eq("is_published", true),
    admin.from("blogger_reviews").select("id", { count: "exact", head: true }),
    admin.from("ai_credits").select("user_id", { count: "exact", head: true })
  ]);
  return {
    pending: pending.count ?? 0,
    published: published.count ?? 0,
    bloggerReviews: bloggerReviews.count ?? 0,
    balances: balances.count ?? 0
  };
}

export default async function AdminPage() {
  const admin = await requireAdminPageContext();
  const counts = await loadCounts();

  const metrics: MetricCard[] = [
    {
      href: "/admin/review",
      label: "Submission review",
      description: "Pending in the queue — open to normalize and publish.",
      icon: ClipboardCheck,
      count: counts.pending
    },
    {
      href: "/admin/published",
      label: "Published records",
      description: "Live shoe records — browse and edit any entry.",
      icon: Library,
      count: counts.published
    },
    {
      href: "/admin/blogger-reviews",
      label: "Blogger reviews",
      description: "博主点评 cards shown on each shoe's comments slide.",
      icon: Megaphone,
      count: counts.bloggerReviews
    },
    {
      href: "/admin/credits",
      label: "Credits & balances",
      description: "Member balances on record — grant or reset credits.",
      icon: Wallet,
      count: counts.balances
    }
  ];

  return (
    <main className="container-shell space-y-6 py-6">
      <AdminPageHeader
        title="Admin console"
        description={`Signed in as ${admin.username}. Pick a section to manage.`}
        icon={Home}
        actions={<AdminLogoutButton />}
      />

      <section className="grid gap-4 sm:grid-cols-2">
        {metrics.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="surface-card premium-border group flex flex-col rounded-2xl p-4 transition hover:border-[rgb(var(--accent)/0.45)] hover:bg-[rgb(var(--muted)/0.12)]"
            >
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="text-3xl font-semibold leading-none tabular-nums">
                  {card.count === null ? "—" : card.count.toLocaleString()}
                </span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="font-semibold">{card.label}</p>
                <ChevronRight className="h-4 w-4 shrink-0 soft-text transition group-hover:translate-x-0.5 group-hover:text-[rgb(var(--accent))]" />
              </div>
              <p className="mt-1 text-sm soft-text">{card.description}</p>
            </Link>
          );
        })}
      </section>

      <Link
        href="/admin/settings"
        className="surface-card premium-border group flex items-center gap-3 rounded-2xl p-4 transition hover:border-[rgb(var(--accent)/0.45)] hover:bg-[rgb(var(--muted)/0.12)]"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
          <Settings2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-2">
            <span className="font-semibold">Site settings</span>
            <ChevronRight className="h-4 w-4 shrink-0 soft-text transition group-hover:translate-x-0.5 group-hover:text-[rgb(var(--accent))]" />
          </span>
          <span className="mt-1 block text-sm soft-text">
            Smart Picker access, daily check-in credits, and bulk image import.
          </span>
        </span>
      </Link>
    </main>
  );
}
