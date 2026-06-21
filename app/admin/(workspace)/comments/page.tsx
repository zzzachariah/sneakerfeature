import { MessageSquare } from "lucide-react";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CommentsClient, type CommentRow } from "./comments-client";

export const dynamic = "force-dynamic";

export default async function AdminCommentsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageContext();
  const db = createAdminClient();
  if (!db) return <Card className="p-5">Service-role client is not configured.</Card>;

  const params = await searchParams;
  const q = (typeof params.q === "string" ? params.q : "").trim();

  const { data: rawComments } = await db
    .from("comments")
    .select("id, content, created_at, user_id, shoe_id")
    .order("created_at", { ascending: false })
    .limit(300);
  const list = (rawComments ?? []) as { id: string; content: string; created_at: string; user_id: string; shoe_id: string }[];

  const userIds = [...new Set(list.map((c) => c.user_id))];
  const shoeIds = [...new Set(list.map((c) => c.shoe_id))];
  const usernameById = new Map<string, string>();
  const shoeNameById = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await db.from("profiles").select("id, username").in("id", userIds);
    for (const p of profiles ?? []) usernameById.set(p.id, p.username);
  }
  if (shoeIds.length) {
    const { data: shoes } = await db.from("shoes").select("id, shoe_name").in("id", shoeIds);
    for (const s of shoes ?? []) shoeNameById.set(s.id, s.shoe_name);
  }

  let rows: CommentRow[] = list.map((c) => ({
    id: c.id,
    content: c.content,
    createdAt: c.created_at,
    author: usernameById.get(c.user_id) ?? "unknown",
    shoeName: shoeNameById.get(c.shoe_id) ?? "(unknown shoe)"
  }));
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.content.toLowerCase().includes(lower) ||
        r.author.toLowerCase().includes(lower) ||
        r.shoeName.toLowerCase().includes(lower)
    );
  }
  rows = rows.slice(0, 200);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Comments"
        description="Browse and moderate the latest comments across every shoe."
        icon={MessageSquare}
      />

      <Card className="p-4">
        <form className="grid gap-2 md:grid-cols-[1fr,auto]" method="GET">
          <Input name="q" placeholder="Search comment text, author or shoe" defaultValue={q} />
          <Button type="submit">Search</Button>
        </form>
      </Card>

      <CommentsClient initialRows={rows} />
    </div>
  );
}
