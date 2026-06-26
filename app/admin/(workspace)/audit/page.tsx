import { ScrollText } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  action: string;
  note: string | null;
  created_at: string;
  target_type: string;
  target_submission_id: string | null;
  target_shoe_id: string | null;
  profiles: { username: string } | { username: string }[] | null;
  shoes: { id: string; shoe_name: string } | { id: string; shoe_name: string }[] | null;
};

function actorName(row: AuditRow): string {
  const p = row.profiles;
  if (!p) return "system";
  return (Array.isArray(p) ? p[0]?.username : p.username) ?? "unknown";
}

export default async function AdminAuditPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [, params] = await Promise.all([requireAdminPageContext(), searchParams]);
  const db = createAdminClient();
  if (!db) return <Card className="p-5">Service-role client is not configured.</Card>;
  const type = typeof params.type === "string" ? params.type : "all";
  const q = typeof params.q === "string" ? params.q : "";

  let query = db
    .from("admin_audit_logs")
    .select(
      "id, action, note, created_at, target_type, target_submission_id, target_shoe_id, profiles!admin_audit_logs_actor_admin_id_fkey(username), shoes!admin_audit_logs_target_shoe_id_fkey(id, shoe_name)"
    )
    .order("created_at", { ascending: false })
    .limit(250);
  if (type !== "all") query = query.eq("target_type", type);
  if (q) {
    // PostgREST treats commas/parens/colons/asterisks as filter tokens — strip
    // them before interpolating user input.
    const safe = q.replace(/[,()*:]/g, " ").trim();
    if (safe) query = query.ilike("action", `%${safe}%`);
  }

  const { data } = await query;
  const rows = (data ?? []) as AuditRow[];

  function targetLabel(row: AuditRow): string {
    if (row.target_type === "shoe" && row.shoes) {
      const shoe = Array.isArray(row.shoes) ? row.shoes[0] : row.shoes;
      return shoe?.shoe_name ?? "(shoe)";
    }
    if (row.target_type === "submission" && row.target_submission_id) return `#${row.target_submission_id.slice(0, 8)}`;
    if (row.target_type === "profile") return "member";
    if (row.target_type === "admin_session") return "session";
    return "—";
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Audit log"
        description="Every admin action — logins, publish/unpublish, submission decisions and role changes."
        icon={ScrollText}
      />

      <Card className="p-4">
        <form className="grid gap-2 md:grid-cols-[1fr,200px,auto]" method="GET">
          <Input name="q" placeholder="Search action (e.g. publish, login)" defaultValue={q} />
          <Select name="type" defaultValue={type}>
            <option value="all">All targets</option>
            <option value="submission">Submissions</option>
            <option value="shoe">Shoes</option>
            <option value="profile">Members</option>
            <option value="admin_session">Sessions</option>
          </Select>
          <Button type="submit">Filter</Button>
        </form>
      </Card>

      <Card className="p-0 overflow-hidden">
        {/* Mobile: each event as a stacked card — no horizontal scroll. */}
        <ol className="divide-y divide-[rgb(var(--muted)/0.35)] md:hidden">
          {rows.map((row) => (
            <li key={row.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-[rgb(var(--muted)/0.45)] px-2 py-0.5 text-[0.7rem]">{row.action}</span>
                <span className="text-[0.65rem] uppercase tracking-wide soft-text">{row.target_type}</span>
              </div>
              <p className="mt-1.5 break-words text-sm font-medium">{targetLabel(row)}</p>
              <p className="num-display mt-1 text-[0.7rem] soft-text">
                @{actorName(row)} · {new Date(row.created_at).toLocaleString()}
              </p>
              {row.note && <p className="mt-1.5 break-words text-xs soft-text">{row.note}</p>}
            </li>
          ))}
          {rows.length === 0 && (
            <li className="p-6 text-center text-sm soft-text">No audit events match.</li>
          )}
        </ol>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-[rgb(var(--bg-elev)/0.85)] text-left text-xs soft-text">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Admin</th>
                <th className="px-3 py-2">Action</th>
                <th className="px-3 py-2">Target</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[rgb(var(--muted)/0.35)] align-top">
                  <td className="num-display whitespace-nowrap px-3 py-3 text-xs soft-text">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="px-3 py-3 font-medium">{actorName(row)}</td>
                  <td className="px-3 py-3">
                    <span className="rounded-full bg-[rgb(var(--muted)/0.45)] px-2 py-1 text-xs">{row.action}</span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="text-[0.65rem] uppercase tracking-wide soft-text">{row.target_type}</div>
                    <div>{targetLabel(row)}</div>
                  </td>
                  <td className="px-3 py-3 text-xs soft-text">{row.note ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm soft-text">
                    No audit events match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
