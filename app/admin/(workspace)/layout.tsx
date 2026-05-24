import { Shield } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminPageContext();

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

          <AdminNav />

          <div className="mt-6">
            <AdminLogoutButton />
          </div>
        </aside>

        <section className="space-y-4">{children}</section>
      </div>
    </main>
  );
}
