import { Users as UsersIcon } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { UsersClient, type UserRow } from "./users-client";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await requireAdminPageContext();
  const db = createAdminClient();
  if (!db) return <Card className="p-5">Service-role client is not configured.</Card>;

  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const role = typeof params.role === "string" ? params.role : "all";

  let query = db
    .from("profiles")
    .select("id, username, email, role, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (role === "admin" || role === "user") query = query.eq("role", role);
  if (q) {
    const safe = q.replace(/[,()*:]/g, " ").trim();
    if (safe) query = query.or(`username.ilike.%${safe}%,email.ilike.%${safe}%`);
  }

  const { data } = await query;
  const profiles = (data ?? []) as { id: string; username: string; email: string; role: string; created_at: string }[];
  const ids = profiles.map((p) => p.id);

  // Activity counts for just the listed members — a bounded fan-out aggregated
  // in JS, so the list stays one query per metric regardless of member count.
  const commentsBy = new Map<string, number>();
  const ratingsBy = new Map<string, number>();
  const favoritesBy = new Map<string, number>();
  const submissionsBy = new Map<string, number>();
  const lastActiveBy = new Map<string, string>();
  const updateLastActive = (uid: string, ts: string | null | undefined) => {
    if (!ts) return;
    const prev = lastActiveBy.get(uid);
    if (!prev || prev < ts) lastActiveBy.set(uid, ts);
  };
  if (ids.length) {
    const [c, r, f, s, v] = await Promise.all([
      db.from("comments").select("user_id, created_at").in("user_id", ids),
      db.from("shoe_ratings").select("user_id, created_at").in("user_id", ids),
      db.from("favorites").select("user_id, created_at").in("user_id", ids),
      db.from("user_submissions").select("user_id, created_at").in("user_id", ids),
      db.from("shoe_views").select("user_id, last_viewed_at").in("user_id", ids)
    ]);
    const tally = (
      input: { user_id: string; created_at?: string | null }[] | null,
      map: Map<string, number>
    ) => {
      for (const row of input ?? []) {
        map.set(row.user_id, (map.get(row.user_id) ?? 0) + 1);
        updateLastActive(row.user_id, row.created_at ?? undefined);
      }
    };
    tally(c.data as { user_id: string; created_at: string }[] | null, commentsBy);
    tally(r.data as { user_id: string; created_at: string }[] | null, ratingsBy);
    tally(f.data as { user_id: string; created_at: string }[] | null, favoritesBy);
    tally(s.data as { user_id: string; created_at: string }[] | null, submissionsBy);
    for (const row of (v.data ?? []) as { user_id: string; last_viewed_at: string }[]) {
      updateLastActive(row.user_id, row.last_viewed_at);
    }
  }

  const rows: UserRow[] = profiles.map((p) => ({
    id: p.id,
    username: p.username,
    email: p.email,
    role: p.role === "admin" ? "admin" : "user",
    createdAt: p.created_at,
    comments: commentsBy.get(p.id) ?? 0,
    ratings: ratingsBy.get(p.id) ?? 0,
    favorites: favoritesBy.get(p.id) ?? 0,
    submissions: submissionsBy.get(p.id) ?? 0,
    lastActiveAt: lastActiveBy.get(p.id) ?? null
  }));

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Members"
        description="Search the member directory, review activity and manage admin access."
        icon={UsersIcon}
      />

      <Card className="p-4">
        <form className="grid gap-2 md:grid-cols-[1fr,180px,auto]" method="GET">
          <Input name="q" placeholder="Search username or email" defaultValue={q} />
          <Select name="role" defaultValue={role}>
            <option value="all">All roles</option>
            <option value="admin">Admins</option>
            <option value="user">Members</option>
          </Select>
          <Button type="submit">Filter</Button>
        </form>
      </Card>

      <UsersClient initialRows={rows} currentAdminId={ctx.userId} />
    </div>
  );
}
