/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export default async function AdminReviewPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdminPageContext();
  const params = await searchParams;
  const supabase = createAdminClient();

  if (!supabase) return <Card className="p-5">Supabase is not configured.</Card>;

  const q = typeof params.q === "string" ? params.q : "";
  const status = typeof params.status === "string" ? params.status : "queue";
  const brand = typeof params.brand === "string" ? params.brand : "all";
  const submitter = typeof params.submitter === "string" ? params.submitter : "";
  const from = typeof params.from === "string" ? params.from : "";
  const to = typeof params.to === "string" ? params.to : "";

  let query = supabase
    .from("user_submissions")
    .select("id, status, created_at, submission_type, target_shoe_id, raw_payload, profiles!user_submissions_user_id_fkey(username), shoes!user_submissions_target_shoe_id_fkey(shoe_name, slug)")
    .order("created_at", { ascending: false })
    .limit(300);

  if (status === "queue") query = query.in("status", ["pending", "normalized", "draft"]);
  else if (status !== "all") query = query.eq("status", status);
  if (from) query = query.gte("created_at", from);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999Z`);

  const { data } = await query;

  const rows = (data ?? []).filter((row: any) => {
    const payload = row.raw_payload ?? {};
    const name = String(payload.shoe_name ?? "").toLowerCase();
    const rowBrand = String(payload.brand ?? "").toLowerCase();
    const username = (Array.isArray(row.profiles) ? row.profiles[0]?.username : row.profiles?.username ?? "").toLowerCase();

    const okQ = !q || `${name} ${rowBrand}`.includes(q.toLowerCase());
    const okBrand = brand === "all" || rowBrand === brand.toLowerCase();
    const okSubmitter = !submitter || username.includes(submitter.toLowerCase());
    return okQ && okBrand && okSubmitter;
  });

  const brands = Array.from(new Set((data ?? []).map((r: any) => String(r.raw_payload?.brand ?? "")).filter(Boolean))).sort();

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Submission review"
        description="Triage user submissions by status, brand, submitter, and date range."
        icon={ClipboardCheck}
      />

      <Card className="p-4">
        <h2 className="text-base font-semibold">Filters</h2>
        <form className="mt-4 grid gap-2 md:grid-cols-6" method="GET">
          <Input name="q" placeholder="Search shoe name" defaultValue={q} className="md:col-span-2" />
          <Select name="status" defaultValue={status}>
            <option value="queue">Queue (pending/normalized/draft)</option>
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="normalized">Normalized</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="rejected">Rejected</option>
            <option value="unpublished">Unpublished</option>
          </Select>
          <Select name="brand" defaultValue={brand}>
            <option value="all">All brands</option>
            {brands.map((b) => (<option key={b} value={b}>{b}</option>))}
          </Select>
          <Input name="submitter" placeholder="Submitter" defaultValue={submitter} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="date" name="from" defaultValue={from} />
            <Input type="date" name="to" defaultValue={to} />
          </div>
          <div className="md:col-span-6 flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="w-full sm:w-auto">Apply filters</Button>
            <Link href="/admin/review" className="w-full sm:w-auto"><Button type="button" variant="secondary" className="w-full sm:w-auto">Reset</Button></Link>
          </div>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-full md:min-w-[760px] text-sm">
            <thead className="bg-[rgb(var(--bg-elev)/0.85)] text-left text-xs soft-text">
              <tr>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Shoe</th>
                <th className="px-3 py-2">Brand</th>
                <th className="px-3 py-2">Submitter</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row: any) => (
                <tr key={row.id} className="border-t border-[rgb(var(--muted)/0.35)]">
                  <td className="px-3 py-3 text-xs soft-text">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-3 py-3 font-medium">{row.raw_payload?.shoe_name ?? "—"}</td>
                  <td className="px-3 py-3">{row.raw_payload?.brand ?? "—"}</td>
                  <td className="px-3 py-3">{Array.isArray(row.profiles) ? row.profiles[0]?.username : row.profiles?.username ?? "unknown"}</td>
                  <td className="px-3 py-3">
                    {row.submission_type === "correction" ? (
                      <div className="space-y-1">
                        <span className="rounded-full bg-[rgb(var(--accent)/0.16)] px-2 py-1 text-xs text-[rgb(var(--accent))]">Correction</span>
                        <p className="text-xs soft-text">
                          Target: {Array.isArray(row.shoes) ? row.shoes[0]?.shoe_name : row.shoes?.shoe_name ?? row.target_shoe_id ?? "unknown"}
                        </p>
                      </div>
                    ) : (
                      <span className="rounded-full bg-[rgb(var(--muted)/0.45)] px-2 py-1 text-xs">New shoe</span>
                    )}
                  </td>
                  <td className="px-3 py-3"><span className="rounded-full bg-[rgb(var(--muted)/0.45)] px-2 py-1 text-xs">{row.status}</span></td>
                  <td className="px-3 py-3"><Link href={`/admin/review/${row.id}`} className="text-[rgb(var(--accent))]">Open workspace</Link></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-sm soft-text">No submissions match current filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
