import Link from "next/link";
import {
  BarChart3,
  Compass,
  Eye,
  Footprints,
  Heart,
  MessageSquare,
  Star,
  UserCircle2,
  Users,
  type LucideIcon
} from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

// Aggregation for "top shoes" is done in JS over a bounded fetch — fine at the
// current scale and keeps the page free of any new DB objects / RPCs.
const MAX_AGG_ROWS = 20000;

function sinceISO(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

type StatCard = { label: string; value: number; icon: LucideIcon; sub: string };
type TopShoe = { id: string; name: string; brand: string; count: number };

export default async function AdminAnalyticsPage() {
  await requireAdminPageContext();
  const db = createAdminClient();
  if (!db) return <Card className="p-5">Service-role client is not configured.</Card>;

  const head = { count: "exact" as const, head: true };
  const [
    users,
    users7d,
    users30d,
    publishedShoes,
    totalShoes,
    comments,
    ratings,
    favorites,
    viewRowsRes,
    favRowsRes,
    personaCount,
    ratingFocusCount,
    footScannedCount
  ] = await Promise.all([
    db.from("profiles").select("id", head),
    db.from("profiles").select("id", head).gte("created_at", sinceISO(7)),
    db.from("profiles").select("id", head).gte("created_at", sinceISO(30)),
    db.from("shoes").select("id", head).eq("is_published", true),
    db.from("shoes").select("id", head),
    db.from("comments").select("id", head),
    db.from("shoe_ratings").select("id", head),
    db.from("favorites").select("shoe_id", head),
    db.from("shoe_views").select("shoe_id, view_count").limit(MAX_AGG_ROWS),
    db.from("favorites").select("shoe_id").limit(MAX_AGG_ROWS),
    // Personalization adoption: how many members have each profile piece set.
    db.from("profiles").select("id", head).not("persona", "is", null),
    db.from("profiles").select("id", head).not("rating_focus", "is", null),
    db.from("profiles").select("id", head).not("foot_profile", "is", null)
  ]);

  const viewRows = (viewRowsRes.data ?? []) as { shoe_id: string; view_count: number | null }[];
  const favRows = (favRowsRes.data ?? []) as { shoe_id: string }[];

  const viewsByShoe = new Map<string, number>();
  let totalViews = 0;
  for (const r of viewRows) {
    const n = r.view_count ?? 0;
    totalViews += n;
    viewsByShoe.set(r.shoe_id, (viewsByShoe.get(r.shoe_id) ?? 0) + n);
  }
  const favByShoe = new Map<string, number>();
  for (const r of favRows) favByShoe.set(r.shoe_id, (favByShoe.get(r.shoe_id) ?? 0) + 1);

  const topViewed = [...viewsByShoe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topFav = [...favByShoe.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const topShoeIds = [...new Set([...topViewed.map(([id]) => id), ...topFav.map(([id]) => id)])];
  const shoeMeta = new Map<string, { shoe_name: string; brand: string }>();
  if (topShoeIds.length) {
    const { data: shoes } = await db.from("shoes").select("id, shoe_name, brand").in("id", topShoeIds);
    for (const s of shoes ?? []) shoeMeta.set(s.id, { shoe_name: s.shoe_name, brand: s.brand });
  }

  const toTopShoes = (entries: [string, number][]): TopShoe[] =>
    entries.map(([id, count]) => ({
      id,
      name: shoeMeta.get(id)?.shoe_name ?? "(unknown shoe)",
      brand: shoeMeta.get(id)?.brand ?? "",
      count
    }));

  const viewsSampled = viewRows.length >= MAX_AGG_ROWS;
  const stats: StatCard[] = [
    {
      label: "Members",
      value: users.count ?? 0,
      icon: Users,
      sub: `+${users7d.count ?? 0} this week · +${users30d.count ?? 0} this month`
    },
    { label: "Total views", value: totalViews, icon: Eye, sub: viewsSampled ? "sampled (recent)" : "all-time" },
    { label: "Favorites", value: favorites.count ?? 0, icon: Heart, sub: "saved shoes" },
    { label: "Ratings", value: ratings.count ?? 0, icon: Star, sub: "star ratings" },
    { label: "Comments", value: comments.count ?? 0, icon: MessageSquare, sub: "across all shoes" },
    {
      label: "Published shoes",
      value: publishedShoes.count ?? 0,
      icon: BarChart3,
      sub: `${(totalShoes.count ?? 0).toLocaleString()} total records`
    }
  ];

  const topViewedShoes = toTopShoes(topViewed);
  const topFavShoes = toTopShoes(topFav);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Analytics"
        description="Engagement at a glance — members, views, favorites, ratings and your most popular shoes."
        icon={BarChart3}
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="num-display text-2xl font-semibold leading-none">{s.value.toLocaleString()}</span>
              </div>
              <p className="mt-3 font-semibold">{s.label}</p>
              <p className="mt-0.5 text-xs soft-text">{s.sub}</p>
            </Card>
          );
        })}
      </section>

      <PersonalizationAdoption
        totalMembers={users.count ?? 0}
        persona={personaCount.count ?? 0}
        ratingFocus={ratingFocusCount.count ?? 0}
        footProfile={footScannedCount.count ?? 0}
      />

      <section className="grid gap-4 lg:grid-cols-2">
        <TopShoeList title="Most viewed shoes" unit="views" shoes={topViewedShoes} />
        <TopShoeList title="Most favorited shoes" unit="favorites" shoes={topFavShoes} />
      </section>
    </div>
  );
}

function PersonalizationAdoption({
  totalMembers,
  persona,
  ratingFocus,
  footProfile
}: {
  totalMembers: number;
  persona: number;
  ratingFocus: number;
  footProfile: number;
}) {
  const tiles: { label: string; icon: LucideIcon; count: number }[] = [
    { label: "Persona set", icon: UserCircle2, count: persona },
    { label: "Rating focus set", icon: Compass, count: ratingFocus },
    { label: "Foot profile on file", icon: Footprints, count: footProfile }
  ];
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Personalization adoption</h2>
        <p className="text-xs soft-text">
          out of <span className="num-display font-semibold">{totalMembers.toLocaleString()}</span> members
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {tiles.map((t) => {
          const pct = totalMembers > 0 ? Math.min(100, (t.count / totalMembers) * 100) : 0;
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--bg-elev)/0.55)] p-3"
            >
              <div className="flex items-center gap-2 text-sm">
                <Icon className="h-4 w-4 text-[rgb(var(--accent))]" />
                <span className="font-medium">{t.label}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="num-display text-xl font-semibold">{t.count.toLocaleString()}</span>
                <span className="text-xs soft-text">{pct.toFixed(1)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgb(var(--text)/0.08)]">
                <div
                  className="h-full rounded-full bg-[rgb(var(--accent))]"
                  style={{ width: `${pct.toFixed(1)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TopShoeList({ title, unit, shoes }: { title: string; unit: string; shoes: TopShoe[] }) {
  return (
    <Card className="p-4">
      <h2 className="text-base font-semibold">{title}</h2>
      {shoes.length === 0 ? (
        <p className="mt-3 text-sm soft-text">No data yet.</p>
      ) : (
        <ol className="mt-3 space-y-1.5">
          {shoes.map((shoe, idx) => (
            <li key={shoe.id}>
              <Link
                href={`/admin/published/${shoe.id}`}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-[rgb(var(--muted)/0.2)]"
              >
                <span className="num-display w-5 shrink-0 text-sm soft-text">{idx + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{shoe.name}</span>
                  {shoe.brand && <span className="block truncate text-xs soft-text">{shoe.brand}</span>}
                </span>
                <span className="num-display shrink-0 text-sm font-semibold">
                  {shoe.count.toLocaleString()}
                  <span className="ml-1 text-xs font-normal soft-text">{unit}</span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
