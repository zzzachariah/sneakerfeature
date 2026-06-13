import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ReportsClient, type ReportRow } from "./reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireAdminPageContext();
  const db = createAdminClient();

  let reports: ReportRow[] = [];
  if (db) {
    const { data: rawReports } = await db
      .from("comment_reports")
      .select("id, reason, status, created_at, comment_id, reporter_id")
      .eq("status", "open")
      .order("created_at", { ascending: false });

    const list = rawReports ?? [];
    const commentIds = [...new Set(list.map((r) => r.comment_id))];
    const reporterIds = [...new Set(list.map((r) => r.reporter_id))];

    const commentsById = new Map<string, { content: string; user_id: string }>();
    const usernameById = new Map<string, string>();

    if (commentIds.length) {
      const { data: comments } = await db
        .from("comments")
        .select("id, content, user_id")
        .in("id", commentIds);
      for (const c of comments ?? []) {
        commentsById.set(c.id, { content: c.content, user_id: c.user_id });
      }
    }

    const profileIds = [
      ...new Set([...reporterIds, ...[...commentsById.values()].map((c) => c.user_id)])
    ];
    if (profileIds.length) {
      const { data: profiles } = await db.from("profiles").select("id, username").in("id", profileIds);
      for (const p of profiles ?? []) usernameById.set(p.id, p.username);
    }

    reports = list.map((r) => {
      const comment = commentsById.get(r.comment_id);
      return {
        id: r.id,
        reason: r.reason,
        createdAt: r.created_at,
        commentId: r.comment_id,
        commentContent: comment?.content ?? "",
        commentExists: Boolean(comment),
        authorUsername: comment ? usernameById.get(comment.user_id) ?? "unknown" : "—",
        reporterUsername: usernameById.get(r.reporter_id) ?? "unknown"
      };
    });
  }

  return <ReportsClient initialReports={reports} />;
}
