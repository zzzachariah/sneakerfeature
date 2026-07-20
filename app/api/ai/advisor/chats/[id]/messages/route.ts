import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSmartPickerContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  const { data: chat } = await admin.from("advisor_chats").select("id, user_id").eq("id", id).maybeSingle();
  if (!chat || chat.user_id !== ctx.userId) {
    return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
  }

  const { data, error } = await admin
    .from("advisor_messages")
    .select("id, role, content, created_at")
    .eq("chat_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, messages: data ?? [] });
}
