import Link from "next/link";
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
  ChevronRight,
  Bell,
  Users,
  MessageSquare,
  BarChart3,
  ScrollText,
  Heart,
  Star,
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
  /** When true, the card pops with the accent treatment regardless of count. */
  pinTop?: boolean;
};

type ToolCard = {
  href: Route;
  label: string;
  description: string;
  icon: LucideIcon;
};

type StatTile = { label: string; value: number | null; icon: LucideIcon };

async function loadCounts() {
  const admin = createAdminClient();
  const empty = {
    pending: null,
    imageCorrections: null,
    published: null,
    bloggerReviews: null,
    balances: null,
    reports: null,
    members: null,
    comments: null,
    favorites: null,
    ratings: null
  };
  if (!admin) return empty;
  const head = { count: "exact" as const, head: true };
  const [pending, imageCorrections, published, bloggerReviews, balances, reports, members, comments, favorites, ratings] =
    await Promise.all([
      admin.from("user_submissions").select("id", head).in("status", ["pending", "normalized", "draft"]),
      admin.from("image_corrections").select("id", head).eq("status", "pending"),
      admin.from("shoes").select("id", head).eq("is_published", true),
      admin.from("blogger_reviews").select("id", head),
      admin.from("ai_credits").select("user_id", head),
      admin.from("comment_reports").select("id", head).eq("status", "open"),
      admin.from("profiles").select("id", head),
      admin.from("comments").select("id", head),
      admin.from("favorites").select("shoe_id", head),
      admin.from("shoe_ratings").select("id", head)
    ]);
  return {
    pending: pending.count ?? 0,
    imageCorrections: imageCorrections.count ?? 0,
    published: published.count ?? 0,
    bloggerReviews: bloggerReviews.count ?? 0,
    balances: balances.count ?? 0,
    reports: reports.count ?? 0,
    members: members.count ?? 0,
    comments: comments.count ?? 0,
    favorites: favorites.count ?? 0,
    ratings: ratings.count ?? 0
  };
}

export default async function AdminPage() {
  const admin = await requireAdminPageContext();
  const counts = await loadCounts();

  const stats: StatTile[] = [
    { label: "Members", value: counts.members, icon: Users },
    { label: "Comments", value: counts.comments, icon: MessageSquare },
    { label: "Favorites", value: counts.favorites, icon: Heart },
    { label: "Ratings", value: counts.ratings, icon: Star }
  ];

  // Cards that need attention (non-zero pending count) bubble to the top so a
  // glance at the home screen surfaces what needs action — best for thumb-first
  // navigation on mobile.
  const metrics: MetricCard[] = [
    {
      href: "/admin/review",
      label: "Submission review",
      description: "Pending in the queue — open to normalize and publish.",
      icon: ClipboardCheck,
      count: counts.pending,
      pinTop: (counts.pending ?? 0) > 0
    },
    {
      href: "/admin/image-corrections",
      label: "Image corrections",
      description: "User-uploaded image fixes — approve to update the shoe's image.",
      icon: ImagePlus,
      count: counts.imageCorrections,
      pinTop: (counts.imageCorrections ?? 0) > 0
    },
    {
      href: "/admin/reports",
      label: "Reported comments",
      description: "Open moderation reports — delete or dismiss flagged comments.",
      icon: Flag,
      count: counts.reports,
      pinTop: (counts.reports ?? 0) > 0
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

  // Sort: actionable (pinTop) cards first, then everything else in declaration
  // order. Within each group the relative order is preserved.
  metrics.sort((a, b) => (b.pinTop ? 1 : 0) - (a.pinTop ? 1 : 0));

  const tools: ToolCard[] = [
    {
      href: "/admin/analytics",
      label: "Analytics",
      description: "Engagement metrics and your most popular shoes.",
      icon: BarChart3
    },
    {
      href: "/admin/users",
      label: "Members",
      description: "Search the directory and manage admin access.",
      icon: Users
    },
    {
      href: "/admin/comments",
      label: "Comments",
      description: "Browse and moderate the latest comments.",
      icon: MessageSquare
    },
    {
      href: "/admin/audit",
      label: "Audit log",
      description: "Every admin action across the system.",
      icon: ScrollText
    },
    {
      href: "/admin/announcements",
      label: "Announcements",
      description: "Publish, edit or take down the site-wide popup.",
      icon: Megaphone
    }
  ];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Admin console"
        description={`Signed in as ${admin.username}. Pick a section to manage.`}
        icon={Home}
        actions={<AdminLogoutButton />}
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="surface-card premium-border rounded-2xl p-4">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
                <Icon className="h-4 w-4" />
              </span>
              <p className="num-display mt-3 text-2xl font-semibold leading-none">
                {s.value === null ? "—" : s.value.toLocaleString()}
              </p>
              <p className="mt-1 text-sm soft-text">{s.label}</p>
            </div>
          );
        })}
      </section>

      {counts.imageCorrections ? (
        <Link
          href="/admin/image-corrections"
          className="group flex items-center gap-3 rounded-2xl border border-[rgb(var(--accent)/0.5)] bg-[rgb(var(--accent)/0.12)] p-4 transition hover:bg-[rgb(var(--accent)/0.18)]"
        >
          <span className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.2)] text-[rgb(var(--accent))]">
            <Bell className="h-5 w-5" />
            <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[rgb(var(--accent))]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-[rgb(var(--accent))]">
              <span className="num-display">{counts.imageCorrections}</span> new image correction{counts.imageCorrections === 1 ? "" : "s"} awaiting review
            </span>
            <span className="mt-0.5 block text-sm soft-text">
              Users uploaded images to fix shoe photos — review and approve them.
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--accent))] transition group-hover:translate-x-0.5" />
        </Link>
      ) : null}

      {/* Metric cards: stacked + tap-friendly on mobile, 2-up grid on desktop. */}
      <section className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {metrics.map((card) => {
          const Icon = card.icon;
          const accent = card.pinTop;
          return (
            <Link
              key={card.href}
              href={card.href}
              className={`group relative flex flex-col rounded-2xl p-4 transition active:scale-[0.99] ${
                accent
                  ? "border border-[rgb(var(--accent)/0.5)] bg-[rgb(var(--accent)/0.08)] shadow-[0_8px_22px_-16px_rgb(var(--accent)/0.7)] hover:bg-[rgb(var(--accent)/0.14)]"
                  : "surface-card premium-border hover:border-[rgb(var(--accent)/0.45)] hover:bg-[rgb(var(--muted)/0.12)]"
              }`}
            >
              <div className="flex items-start gap-3">
                <span
                  className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                    accent
                      ? "bg-[rgb(var(--accent)/0.2)] text-[rgb(var(--accent))]"
                      : "bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`font-semibold ${accent ? "text-[rgb(var(--accent))]" : ""}`}>
                      {card.label}
                    </p>
                    <span
                      className={`num-display text-2xl font-semibold leading-none ${
                        accent ? "text-[rgb(var(--accent))]" : ""
                      }`}
                    >
                      {card.count === null ? "—" : card.count.toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-sm soft-text">{card.description}</p>
                </div>
              </div>
              <ChevronRight
                className={`absolute right-4 top-1/2 hidden h-4 w-4 -translate-y-1/2 transition group-hover:translate-x-0.5 sm:block ${
                  accent ? "text-[rgb(var(--accent))]" : "soft-text group-hover:text-[rgb(var(--accent))]"
                }`}
              />
            </Link>
          );
        })}
      </section>

      <section className="space-y-2">
        <p className="px-1 text-[0.65rem] font-semibold uppercase tracking-[0.14em] soft-text">Insights &amp; tools</p>
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
          {tools.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                className="surface-card premium-border group flex items-center gap-3 rounded-2xl p-4 transition active:scale-[0.99] hover:border-[rgb(var(--accent)/0.45)] hover:bg-[rgb(var(--muted)/0.12)]"
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{card.label}</span>
                    <ChevronRight className="h-4 w-4 shrink-0 soft-text transition group-hover:translate-x-0.5 group-hover:text-[rgb(var(--accent))]" />
                  </span>
                  <span className="mt-1 block text-sm soft-text">{card.description}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <Link
        href="/admin/settings"
        className="surface-card premium-border group flex items-center gap-3 rounded-2xl p-4 transition active:scale-[0.99] hover:border-[rgb(var(--accent)/0.45)] hover:bg-[rgb(var(--muted)/0.12)]"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
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
    </div>
  );
}
