import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  const { data, error } = await admin
    .from("ai_chats")
    .select("id, title, created_at, updated_at")
    .eq("user_id", ctx.userId)
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, chats: data ?? [] });
}

export async function POST() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  const { data, error } = await admin
    .from("ai_chats")
    .insert({ user_id: ctx.userId, title: null })
    .select("id, title, created_at, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, message: error?.message ?? "Failed to create chat." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, chat: data });
}
