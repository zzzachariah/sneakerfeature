import Link from "next/link";
import type { Route } from "next";
import { Megaphone, Youtube, PlayCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

const PAGE_SIZE = 50;

export default async function AdminBloggerReviewsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageContext();

  const supabase = await createClient();
  if (!supabase) {
    return (
      <div className="space-y-4">
        <AdminPageHeader title="Blogger reviews" icon={Megaphone} />
        <Card className="p-5">Supabase is not configured.</Card>
      </div>
    );
  }

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const requestedPage = Math.max(1, Number.parseInt(typeof params.page === "string" ? params.page : "1", 10) || 1);

  // Flexible search: every whitespace-separated word must appear in the shoe
  // name OR brand (in any order), instead of requiring one exact substring.
  // Strip PostgREST structural tokens before interpolating into .or().
  const tokens = q
    .split(/\s+/)
    .map((t) => t.replace(/[,()*:%]/g, "").trim())
    .filter(Boolean);

  // Stage 1: run count and a speculative first-page query in parallel.
  let countQuery = supabase.from("shoes").select("id", { count: "exact", head: true });
  for (const tok of tokens) countQuery = countQuery.or(`shoe_name.ilike.%${tok}%,brand.ilike.%${tok}%`);

  let speculativeQuery = supabase
    .from("shoes")
    .select("id, shoe_name, brand, blogger_reviews(platform)")
    .order("shoe_name", { ascending: true })
    .range(0, PAGE_SIZE - 1);
  for (const tok of tokens) speculativeQuery = speculativeQuery.or(`shoe_name.ilike.%${tok}%,brand.ilike.%${tok}%`);

  const [{ count }, { data: speculativeShoes }] = await Promise.all([countQuery, speculativeQuery]);

  // Stage 2: if the user requested a page other than page 1, fetch it.
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);

  let shoes: typeof speculativeShoes;
  if (page === 1) {
    shoes = speculativeShoes;
  } else {
    const pageFrom = (page - 1) * PAGE_SIZE;
    let dataQuery = supabase
      .from("shoes")
      .select("id, shoe_name, brand, blogger_reviews(platform)")
      .order("shoe_name", { ascending: true })
      .range(pageFrom, pageFrom + PAGE_SIZE - 1);
    for (const tok of tokens) dataQuery = dataQuery.or(`shoe_name.ilike.%${tok}%,brand.ilike.%${tok}%`);
    ({ data: shoes } = await dataQuery);
  }

  const from = (page - 1) * PAGE_SIZE;

  // Build counts map from the nested blogger_reviews rows (no third query needed).
  const counts = new Map<string, { youtube: number; bilibili: number }>();
  for (const shoe of shoes ?? []) {
    let youtube = 0, bilibili = 0;
    for (const r of (shoe as { blogger_reviews?: { platform: string }[] }).blogger_reviews ?? []) {
      if (r.platform === "youtube") youtube++;
      else if (r.platform === "bilibili") bilibili++;
    }
    counts.set(shoe.id, { youtube, bilibili });
  }

  const rangeStart = total === 0 ? 0 : from + 1;
  const rangeEnd = from + (shoes?.length ?? 0);
  const pageHref = (n: number): Route => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (n > 1) sp.set("page", String(n));
    const qs = sp.toString();
    return `/admin/blogger-reviews${qs ? `?${qs}` : ""}` as Route;
  };

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Blogger reviews"
        description="Browse shoes and manage each one's 博主点评 cards. Click a shoe to view, edit, publish, or delete its reviews."
        icon={Megaphone}
      />

      <Card className="p-4">
        <form className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center" method="GET">
          <Input name="q" placeholder="Search shoe name or brand…" defaultValue={q} className="max-w-full md:max-w-xs" />
          <Button type="submit">Search</Button>
          {q && (
            <Link href="/admin/blogger-reviews" className="text-xs text-[rgb(var(--accent))]">
              Clear
            </Link>
          )}
          <p className="text-xs soft-text tabular-nums md:ml-auto">
            {total} shoe(s){q ? ` matching “${q}”` : ""}
            {total > 0 ? ` · showing ${rangeStart}–${rangeEnd}` : ""}
          </p>
        </form>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[rgb(var(--bg-elev)/0.85)] text-left text-xs soft-text">
            <tr>
              <th className="px-3 py-2">Shoe</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Reviews</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {(shoes ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm soft-text">
                  No shoes{q ? " match this search" : ""}.
                </td>
              </tr>
            )}
            {(shoes ?? []).map((shoe) => {
              const c = counts.get(shoe.id) ?? { youtube: 0, bilibili: 0 };
              const totalReviews = c.youtube + c.bilibili;
              return (
                <tr key={shoe.id} className="border-t border-[rgb(var(--muted)/0.35)] hover:bg-[rgb(var(--muted)/0.15)]">
                  <td className="px-3 py-3 font-medium">
                    <Link href={`/admin/blogger-reviews/${shoe.id}`} className="hover:text-[rgb(var(--accent))]">
                      {shoe.shoe_name}
                    </Link>
                  </td>
                  <td className="px-3 py-3 soft-text">{shoe.brand ?? "—"}</td>
                  <td className="px-3 py-3">
                    {totalReviews === 0 ? (
                      <span className="soft-text">—</span>
                    ) : (
                      <span className="inline-flex items-center gap-3">
                        <span className="inline-flex items-center gap-1 tabular-nums" title="YouTube">
                          <Youtube className="h-4 w-4 text-rose-400" />
                          {c.youtube}
                        </span>
                        <span className="inline-flex items-center gap-1 tabular-nums" title="Bilibili">
                          <PlayCircle className="h-4 w-4 text-sky-400" />
                          {c.bilibili}
                        </span>
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link href={`/admin/blogger-reviews/${shoe.id}`} className="text-[rgb(var(--accent))]">
                      Manage →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </Card>

      {totalPages > 1 && (
        <Card className="flex items-center justify-center gap-3 p-3">
          {page > 1 ? (
            <Link
              href={pageHref(page - 1)}
              className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--muted)/0.5)] px-3 py-1 text-xs hover:bg-[rgb(var(--muted)/0.25)]"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--muted)/0.5)] px-3 py-1 text-xs opacity-40">
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </span>
          )}
          <span className="text-xs soft-text tabular-nums">
            Page {page} of {totalPages}
          </span>
          {page < totalPages ? (
            <Link
              href={pageHref(page + 1)}
              className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--muted)/0.5)] px-3 py-1 text-xs hover:bg-[rgb(var(--muted)/0.25)]"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--muted)/0.5)] px-3 py-1 text-xs opacity-40">
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </span>
          )}
        </Card>
      )}
    </div>
  );
}
