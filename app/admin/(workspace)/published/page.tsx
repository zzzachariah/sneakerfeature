import Link from "next/link";
import { Library } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export default async function AdminPublishedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPageContext();
  const supabase = await createClient();
  if (!supabase) return <Card className="p-5">Supabase is not configured.</Card>;

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const brand = typeof params.brand === "string" ? params.brand : "all";
  const state = typeof params.state === "string" ? params.state : "all";

  let query = supabase
    .from("shoes")
    .select("id, slug, shoe_name, brand, release_year, is_published, updated_at")
    .order("updated_at", { ascending: false })
    .limit(300);

  if (brand !== "all") query = query.eq("brand", brand);
  if (state === "published") query = query.eq("is_published", true);
  if (state === "unpublished") query = query.eq("is_published", false);
  if (q) {
    // PostgREST .or() parses commas/parens/colons/asterisks as structural tokens,
    // so strip them from user input before interpolating into the filter string.
    const safe = q.replace(/[,()*:]/g, " ").trim();
    if (safe) query = query.or(`shoe_name.ilike.%${safe}%,brand.ilike.%${safe}%`);
  }

  const { data } = await query;
  const brands = Array.from(new Set((data ?? []).map((row) => row.brand))).sort();

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Published records"
        description="Edit live shoe records and toggle publish state safely."
        icon={Library}
      />

      <Card className="p-4">
        <h2 className="text-base font-semibold">Filters</h2>
        <form className="mt-4 grid gap-2 md:grid-cols-4" method="GET">
          <Input name="q" placeholder="Search shoe name" defaultValue={q} />
          <select name="brand" defaultValue={brand} className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.7)] px-3 py-2 text-sm">
            <option value="all">All brands</option>
            {brands.map((b) => (<option key={b} value={b}>{b}</option>))}
          </select>
          <select name="state" defaultValue={state} className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.7)] px-3 py-2 text-sm">
            <option value="all">All states</option>
            <option value="published">Published</option>
            <option value="unpublished">Unpublished</option>
          </select>
          <Button type="submit">Filter</Button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[rgb(var(--bg-elev)/0.85)] text-left text-xs soft-text">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Brand</th>
              <th className="px-3 py-2">Release</th>
              <th className="px-3 py-2">State</th>
              <th className="px-3 py-2">Updated</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((shoe) => (
              <tr key={shoe.id} className="border-t border-[rgb(var(--muted)/0.35)]">
                <td className="px-3 py-3 font-medium">{shoe.shoe_name}</td>
                <td className="px-3 py-3">{shoe.brand}</td>
                <td className="px-3 py-3">{shoe.release_year ?? "—"}</td>
                <td className="px-3 py-3"><span className="rounded-full bg-[rgb(var(--muted)/0.45)] px-2 py-1 text-xs">{shoe.is_published ? "published" : "unpublished"}</span></td>
                <td className="px-3 py-3 text-xs soft-text">{new Date(shoe.updated_at).toLocaleString()}</td>
                <td className="px-3 py-3"><Link href={`/admin/published/${shoe.id}`} className="text-[rgb(var(--accent))]">Edit record</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
