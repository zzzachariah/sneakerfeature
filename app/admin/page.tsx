/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from "next/link";
import { LayoutDashboard, Settings2, Inbox, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { isSmartPickerPublicEnabled } from "@/lib/admin/settings";
import { Card } from "@/components/ui/card";
import { BulkImageImportButton } from "@/components/admin/bulk-image-import-button";
import { SmartPickerToggle } from "@/components/admin/smart-picker-toggle";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export default async function AdminPage() {
  await requireAdminPageContext();
  const supabase = await createClient();
  if (!supabase) {
    return (
      <>
        <AdminPageHeader title="Overview" description="Dashboard and global settings." icon={LayoutDashboard} />
        <Card className="p-5">Supabase is not configured.</Card>
      </>
    );
  }
  const smartPickerPublic = await isSmartPickerPublicEnabled();

  const [pending, publishedCount, recentSubmissions, recentPublished] = await Promise.all([
    supabase.from("user_submissions").select("id", { count: "exact", head: true }).in("status", ["pending", "normalized", "draft"]),
    supabase.from("shoes").select("id", { count: "exact", head: true }).eq("is_published", true),
    supabase
      .from("user_submissions")
      .select("id, status, created_at, raw_payload, profiles!user_submissions_user_id_fkey(username)")
      .in("status", ["pending", "normalized", "draft"])
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.from("shoes").select("id, slug, shoe_name, brand, updated_at, is_published").order("updated_at", { ascending: false }).limit(8)
  ]);

  return (
    <>
      <AdminPageHeader
        title="Overview"
        description="At-a-glance metrics, recent activity, and global site settings."
        icon={LayoutDashboard}
      />

      <section className="grid gap-3 sm:grid-cols-2">
        <StatCard label="Pending review queue" value={pending.count ?? 0} hint="pending / normalized / draft" />
        <StatCard label="Published shoes" value={publishedCount.count ?? 0} hint="live records" />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-[rgb(var(--accent))]" />
              <h2 className="text-base font-semibold">Recent submissions</h2>
            </div>
            <Link href="/admin/review" className="text-xs text-[rgb(var(--accent))]">Open queue →</Link>
          </div>
          <div className="space-y-2">
            {(recentSubmissions.data ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed border-[rgb(var(--muted)/0.45)] px-3 py-6 text-center text-xs soft-text">
                Queue is empty.
              </p>
            )}
            {(recentSubmissions.data ?? []).map((row: any) => (
              <Link
                key={row.id}
                href={`/admin/review/${row.id}`}
                className="block rounded-lg border border-[rgb(var(--muted)/0.45)] px-3 py-2 hover:bg-[rgb(var(--muted)/0.22)]"
              >
                <p className="text-sm font-medium">{row.raw_payload?.shoe_name ?? "Untitled submission"}</p>
                <p className="text-xs soft-text">
                  by {Array.isArray(row.profiles) ? row.profiles[0]?.username : row.profiles?.username ?? "unknown"} • {row.status}
                </p>
              </Link>
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[rgb(var(--accent))]" />
              <h2 className="text-base font-semibold">Recent published records</h2>
            </div>
            <Link href="/admin/published" className="text-xs text-[rgb(var(--accent))]">Manage all →</Link>
          </div>
          <div className="space-y-2">
            {(recentPublished.data ?? []).length === 0 && (
              <p className="rounded-lg border border-dashed border-[rgb(var(--muted)/0.45)] px-3 py-6 text-center text-xs soft-text">
                No records yet.
              </p>
            )}
            {(recentPublished.data ?? []).map((shoe: any) => (
              <Link
                key={shoe.id}
                href={`/admin/published/${shoe.id}`}
                className="block rounded-lg border border-[rgb(var(--muted)/0.45)] px-3 py-2 hover:bg-[rgb(var(--muted)/0.22)]"
              >
                <p className="text-sm font-medium">{shoe.shoe_name}</p>
                <p className="text-xs soft-text">{shoe.brand} • {shoe.is_published ? "Published" : "Unpublished"}</p>
              </Link>
            ))}
          </div>
        </Card>
      </section>

      <Card className="p-4">
        <div className="mb-4 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-[rgb(var(--accent))]" />
          <h2 className="text-base font-semibold">Site settings</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.55)] p-3">
            <p className="text-sm font-medium">Smart Picker access</p>
            <p className="mt-1 text-xs soft-text">
              Decide whether the AI Smart Picker (chat, recharge, payment flow) is visible to regular users.
            </p>
            <div className="mt-3">
              <SmartPickerToggle initialEnabled={smartPickerPublic} />
            </div>
          </div>

          <div className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.55)] p-3">
            <p className="text-sm font-medium">Bulk image import</p>
            <p className="mt-1 text-xs soft-text">
              Trigger a one-off background job to backfill product images for published shoes.
            </p>
            <div className="mt-3">
              <BulkImageImportButton />
            </div>
          </div>
        </div>
      </Card>
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-[0.12em] soft-text">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs soft-text">{hint}</p>}
    </Card>
  );
}
