import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { blockUserSchema } from "@/lib/validation/schemas";

// Returns the ids of users the caller has blocked, so the client can hide them.
export async function GET() {
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: true, blocked: [] });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: true, blocked: [] });

  const { data, error } = await supabase
    .from("user_blocks")
    .select("blocked_id")
    .eq("blocker_id", user.id);

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, blocked: (data ?? []).map((row) => row.blocked_id) });
}

// Block or unblock a user. Blocked users' comments are hidden from the caller
// (filtered server-side in GET /api/comments). Required by App Store Guideline 1.2.
export async function POST(request: Request) {
  const body = await request.json();
  const parsed = blockUserSchema.safeParse(body);
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

  if (parsed.data.userId === user.id) {
    return NextResponse.json({ ok: false, message: "You cannot block yourself." }, { status: 400 });
  }

  if (parsed.data.action === "block") {
    const { error } = await supabase
      .from("user_blocks")
      .upsert({ blocker_id: user.id, blocked_id: parsed.data.userId }, { onConflict: "blocker_id,blocked_id" });
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "User blocked. You won't see their comments." });
  }

  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", user.id)
    .eq("blocked_id", parsed.data.userId);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, message: "User unblocked." });
}
