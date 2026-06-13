import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { reportCommentSchema } from "@/lib/validation/schemas";

// Lets a signed-in user report an objectionable comment. Reports land in the
// admin moderation queue (see /admin/reports). Required by App Store Guideline 1.2.
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = reportCommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 400 });
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Authentication required." }, { status: 401 });
  }

  // Upsert so a repeated report from the same user is idempotent (re-opens it).
  const { error } = await supabase.from("comment_reports").upsert(
    {
      comment_id: parsed.data.commentId,
      reporter_id: user.id,
      reason: parsed.data.reason,
      status: "open"
    },
    { onConflict: "comment_id,reporter_id" }
  );

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Report submitted. We review reports within 24 hours." });
}
