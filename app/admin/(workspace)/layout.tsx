import { Shield } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import { AdminNav, type AdminNavCounts } from "@/components/admin/admin-nav";

async function loadNavCounts(): Promise<AdminNavCounts> {
  const db = createAdminClient();
  if (!db) return {};
  const [submissions, imageCorrections, reports] = await Promise.all([
    db.from("user_submissions").select("id", { count: "exact", head: true }).in("status", ["pending", "normalized", "draft"]),
    db.from("image_corrections").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("comment_reports").select("id", { count: "exact", head: true }).eq("status", "open")
  ]);
  return {
    "/admin/review": submissions.count ?? 0,
    "/admin/image-corrections": imageCorrections.count ?? 0,
    "/admin/reports": reports.count ?? 0
  };
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPageContext();
  const navCounts = await loadNavCounts();

  return (
    <main className="container-shell py-6">
      <div className="grid gap-4 lg:grid-cols-[260px,1fr]">
        <aside className="surface-card premium-border h-fit rounded-2xl p-4 lg:sticky lg:top-6">
          <div className="mb-5 rounded-xl border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.55)] p-3">
            <p className="text-xs uppercase tracking-[0.12em] soft-text">Admin mode</p>
            <div className="mt-2 flex items-center gap-2">
              <Shield className="h-4 w-4 text-[rgb(var(--accent))]" />
              <p className="font-medium">{admin.username}</p>
            </div>
            <p className="mt-1 text-xs text-[rgb(var(--accent))]">role: {admin.role}</p>
          </div>

          <AdminNav counts={navCounts} />

          <div className="mt-6">
            <AdminLogoutButton />
          </div>
        </aside>

        <section className="space-y-4">{children}</section>
      </div>
    </main>
  );
}
