import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMemberContext } from "@/lib/subscription/entitlements";

// Advisor threads are Max-only, so both list and create gate on tier (admins
// resolve to Max). Pro/free never reach the chat UI, but the API enforces it too.
async function requireMax() {
  const ctx = await getSmartPickerContext();
  if (!ctx) return { error: NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 }) };
  const member = await getMemberContext(ctx.userId);
  const tier = ctx.isAdmin ? "max" : member.tier;
  if (tier !== "max") {
    return { error: NextResponse.json({ ok: false, code: "locked", message: "The AI advisor is a Max feature." }, { status: 403 }) };
  }
  const admin = createAdminClient();
  if (!admin) return { error: NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 }) };
  return { ctx, admin };
}

export async function GET() {
  const gate = await requireMax();
  if (gate.error) return gate.error;
  const { ctx, admin } = gate;

  const { data, error } = await admin
    .from("advisor_chats")
    .select("id, title, created_at, updated_at")
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, chats: data ?? [] });
}

export async function POST() {
  const gate = await requireMax();
  if (gate.error) return gate.error;
  const { ctx, admin } = gate;

  const { data, error } = await admin
    .from("advisor_chats")
    .insert({ user_id: ctx.userId, title: null })
    .select("id, title, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, message: error?.message ?? "Failed to create chat." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, chat: data });
}
