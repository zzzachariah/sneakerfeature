import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShoes } from "@/lib/data/shoes";
import { demoShoes } from "@/lib/data/demo-shoes";
import { isValidPersona, type Persona } from "@/lib/persona/types";
import {
  createPackyClient,
  getPackyEnvReport,
  describePackyEnvProblem,
  getPackyTarget,
  describePackyError
} from "@/lib/ai/packy-client";
import { recommendShoes, enrichRecommendations, type ChatTurn } from "@/lib/ai/recommend";
import { getBalance, deductCredits, InsufficientCreditsError } from "@/lib/ai/credits";
import { MAX_RECOMMENDATIONS, type RecommendationRaw } from "@/lib/ai/types";

const schema = z.object({
  chatId: z.string().uuid(),
  message: z.string().trim().min(1, "Message is required.").max(2000),
  count: z.number().int().min(1).max(MAX_RECOMMENDATIONS)
});

type HistoryRow = { role: "user" | "assistant"; content: string; recommendations: RecommendationRaw[] | null };

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
  const { chatId, message, count } = parsed.data;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  // Verify chat ownership.
  const { data: chat } = await admin.from("ai_chats").select("id, user_id, title").eq("id", chatId).maybeSingle();
  if (!chat || chat.user_id !== ctx.userId) {
    return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
  }

  // Balance pre-check: refuse before spending anything if it can't cover the
  // requested count (count is chosen up front, so this is deterministic).
  const balance = await getBalance(ctx.userId);
  if (balance < count) {
    return NextResponse.json({ ok: true, insufficient: true, balance, needed: count });
  }

  // Fail fast if the AI provider isn't configured (before persisting anything).
  const client = createPackyClient();
  if (!client) {
    const report = getPackyEnvReport();
    console.error("[ai/chat] packyapi not configured", report);
    return NextResponse.json({ ok: false, message: describePackyEnvProblem(report) }, { status: 503 });
  }

  // Load PRIOR history (before inserting this turn) + catalog + persona in parallel.
  const [{ data: historyRows }, shoes, { data: profileRow }] = await Promise.all([
    admin
      .from("ai_messages")
      .select("role, content, recommendations")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true }),
    getShoes(),
    admin.from("profiles").select("persona").eq("id", ctx.userId).maybeSingle()
  ]);
  const byId = new Map(shoes.map((shoe) => [shoe.id, shoe]));
  const usingDemo = shoes === demoShoes; // getShoes() returns demoShoes by reference when the DB is empty/unreachable
  const rawPersona = profileRow?.persona;
  const persona: Persona | null = isValidPersona(rawPersona) ? rawPersona : null;

  // Build prior LLM turns; surface previously-recommended shoe names so follow-ups
  // ("第一双太贵了") have context.
  const history: ChatTurn[] = (historyRows ?? []).map((row) => {
    const r = row as HistoryRow;
    if (r.role === "assistant" && Array.isArray(r.recommendations) && r.recommendations.length) {
      const names = r.recommendations.map((rec) => byId.get(rec.shoe_id)?.shoe_name).filter(Boolean);
      return { role: "assistant", content: names.length ? `${r.content}\n[已推荐: ${names.join(", ")}]` : r.content };
    }
    return { role: r.role, content: r.content };
  });

  // Persist the user message (after capturing prior history).
  const { data: userMessage, error: userErr } = await admin
    .from("ai_messages")
    .insert({ chat_id: chatId, role: "user", content: message, credits_charged: 0 })
    .select("id, role, content, recommendations, credits_charged, created_at")
    .single();
  if (userErr || !userMessage) {
    return NextResponse.json({ ok: false, message: "Failed to save message." }, { status: 500 });
  }

  // Title the chat from the first user message.
  if (!chat.title) {
    await admin.from("ai_chats").update({ title: message.slice(0, 30), updated_at: new Date().toISOString() }).eq("id", chatId);
  }

  let result;
  try {
    result = await recommendShoes(client, { shoes, history, currentInput: message, count, persona });
  } catch (error) {
    console.error("[ai/chat] recommend failed", error);
    const target = getPackyTarget();
    return NextResponse.json(
      {
        ok: false,
        message: `AI 调用失败：${describePackyError(error)}。请求目标 Base URL：${target.baseURL ?? "(未设置)"}，模型：${target.model}。`
      },
      { status: 502 }
    );
  }

  // Keep only valid, in-catalog, de-duplicated ids, capped at the paid count.
  const seen = new Set<string>();
  const validRaw: RecommendationRaw[] = [];
  for (const rec of result.recommendations) {
    if (!rec.shoe_id || seen.has(rec.shoe_id) || !byId.has(rec.shoe_id)) continue;
    seen.add(rec.shoe_id);
    validRaw.push({ shoe_id: rec.shoe_id, reason: rec.reason ?? "" });
    if (validRaw.length >= count) break;
  }
  const charge = validRaw.length;

  // Charge only for shoes actually recommended.
  let newBalance = balance;
  if (charge > 0) {
    try {
      newBalance = await deductCredits(ctx.userId, charge);
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json({ ok: true, insufficient: true, balance: error.balance, needed: charge });
      }
      console.error("[ai/chat] deduct failed", error);
      return NextResponse.json({ ok: false, message: "扣费失败，请重试。" }, { status: 500 });
    }
  }

  console.warn("[ai/chat] catalog", {
    size: shoes.length,
    usingDemo,
    hasPersona: persona !== null,
    aiReturned: result.recommendations.length,
    matched: charge
  });

  let replyText = result.reply.trim() || (charge > 0 ? "为你推荐如下：" : "暂时没有找到匹配的鞋款，换个描述再试试？");
  if (charge === 0) {
    const r = result.recommendations.length;
    replyText += `（检索了 ${shoes.length} 双库内鞋款；AI 返回 ${r} 条建议${r > 0 ? "，但都不在库内（型号未收录或 id 无效）" : ""}）`;
  }
  if (usingDemo) {
    replyText = `⚠️当前使用内置示例数据（仅 ${shoes.length} 双），未连接数据库。\n${replyText}`;
  }

  const { data: assistantRow, error: assistantErr } = await admin
    .from("ai_messages")
    .insert({
      chat_id: chatId,
      role: "assistant",
      content: replyText,
      recommendations: validRaw.length ? validRaw : null,
      credits_charged: charge
    })
    .select("id, role, content, recommendations, credits_charged, created_at")
    .single();
  if (assistantErr || !assistantRow) {
    return NextResponse.json({ ok: false, message: "Failed to save reply." }, { status: 500 });
  }

  await admin.from("ai_chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);

  return NextResponse.json({
    ok: true,
    userMessage,
    assistantMessage: {
      id: assistantRow.id,
      role: assistantRow.role,
      content: assistantRow.content,
      credits_charged: assistantRow.credits_charged,
      created_at: assistantRow.created_at,
      recommendations: enrichRecommendations(validRaw, byId)
    },
    balance: newBalance,
    charge
  });
}
