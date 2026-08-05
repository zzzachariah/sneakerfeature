import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShoes } from "@/lib/data/shoes";
import { enrichRecommendations } from "@/lib/ai/recommend";
import type { RecommendationRaw } from "@/lib/ai/types";

// `follow_up` is optional at the type level as well as in the query: it only
// exists once migration 049 has been applied (see the fallback select below).
type MessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendations: RecommendationRaw[] | null;
  credits_charged: number;
  created_at: string;
  follow_up?: string | null;
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getSmartPickerContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  const { data: chat } = await admin.from("ai_chats").select("id, user_id").eq("id", id).maybeSingle();
  if (!chat || chat.user_id !== ctx.userId) {
    return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
  }

  // `follow_up` arrives with migration 049. Selecting it on a database that
  // hasn't been migrated yet errors the whole query, so fall back to the legacy
  // column list — a reopened conversation then simply shows no follow-up box.
  const LEGACY_COLS = "id, role, content, recommendations, credits_charged, created_at";
  const fetchRows = async (cols: string) =>
    admin.from("ai_messages").select(cols).eq("chat_id", id).order("created_at", { ascending: true });

  let { data, error } = await fetchRows(`${LEGACY_COLS}, follow_up`);
  if (error) ({ data, error } = await fetchRows(LEGACY_COLS));

  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  const shoes = await getShoes();
  const byId = new Map(shoes.map((shoe) => [shoe.id, shoe]));

  const rows = (data ?? []) as unknown as MessageRow[];
  const messages = rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    credits_charged: r.credits_charged,
    created_at: r.created_at,
    followUp: typeof r.follow_up === "string" && r.follow_up.trim() ? r.follow_up : null,
    recommendations: r.recommendations ? enrichRecommendations(r.recommendations, byId) : null
  }));

  return NextResponse.json({ ok: true, messages });
}
