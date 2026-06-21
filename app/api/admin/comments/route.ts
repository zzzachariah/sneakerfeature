import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  commentId: z.string().uuid(),
  action: z.literal("delete")
});

// Proactive comment moderation (not tied to a user report). Deleting a comment
// cascades its reports; any lingering open reports are marked reviewed.
export async function POST(request: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." }, { status: 400 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ ok: false, message: "Service-role client unavailable." }, { status: 500 });

  const { error } = await db.from("comments").delete().eq("id", parsed.data.commentId);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  await db.from("comment_reports").update({ status: "reviewed" }).eq("comment_id", parsed.data.commentId);

  return NextResponse.json({ ok: true, message: "Comment deleted." });
}
