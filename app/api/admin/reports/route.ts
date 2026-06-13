import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const actionSchema = z.object({
  reportId: z.string().uuid(),
  commentId: z.string().uuid().optional(),
  action: z.enum(["delete_comment", "dismiss"])
});

// Admin moderation actions on reported comments. Deleting a comment also clears
// any other open reports against it.
export async function POST(request: Request) {
  const admin = await getAdminContext();
  if (!admin) {
    return NextResponse.json({ ok: false, message: "Admin access required." }, { status: 403 });
  }

  const parsed = actionSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ ok: false, message: "Service role is not configured." }, { status: 400 });
  }

  if (parsed.data.action === "delete_comment" && parsed.data.commentId) {
    const { error: delError } = await db.from("comments").delete().eq("id", parsed.data.commentId);
    if (delError) return NextResponse.json({ ok: false, message: delError.message }, { status: 400 });
    // The comment cascade removes its reports; mark any lingering ones reviewed.
    await db.from("comment_reports").update({ status: "reviewed" }).eq("comment_id", parsed.data.commentId);
    return NextResponse.json({ ok: true, message: "Comment deleted." });
  }

  const { error } = await db
    .from("comment_reports")
    .update({ status: "dismissed" })
    .eq("id", parsed.data.reportId);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: "Report dismissed." });
}
