import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShoes } from "@/lib/data/shoes";
import { enrichRecommendations } from "@/lib/ai/recommend";
import type { RecommendationRaw } from "@/lib/ai/types";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  const { data: chat } = await admin.from("ai_chats").select("id, user_id").eq("id", id).maybeSingle();
  if (!chat || chat.user_id !== ctx.userId) {
    return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
  }

  const { data: rows, error } = await admin
    .from("ai_messages")
    .select("id, role, content, recommendations, credits_charged, created_at")
    .eq("chat_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  const shoes = await getShoes();
  const byId = new Map(shoes.map((shoe) => [shoe.id, shoe]));

  const messages = (rows ?? []).map((row) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    credits_charged: row.credits_charged,
    created_at: row.created_at,
    recommendations: row.recommendations
      ? enrichRecommendations(row.recommendations as RecommendationRaw[], byId)
      : null
  }));

  return NextResponse.json({ ok: true, messages });
}
