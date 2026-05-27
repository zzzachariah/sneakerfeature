import { NextResponse } from "next/server";
import { z } from "zod";
import { getSmartPickerContext } from "@/lib/ai/access";
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
import { recommendShoes, enrichRecommendations, matchShoeByName, type ChatTurn } from "@/lib/ai/recommend";
import { isBochaConfigured } from "@/lib/ai/web-search";
import { getBalance, deductCredits, InsufficientCreditsError } from "@/lib/ai/credits";
import { MAX_RECOMMENDATIONS, type RecommendationRaw } from "@/lib/ai/types";
import { blendedRecommendationStars, isValidFocus, type RatingFocus } from "@/lib/star-rating";

const schema = z.object({
  chatId: z.string().uuid(),
  message: z.string().trim().min(1, "Message is required.").max(2000),
  count: z.number().int().min(1).max(MAX_RECOMMENDATIONS)
});

type HistoryRow = { role: "user" | "assistant"; content: string; recommendations: RecommendationRaw[] | null };

export async function POST(request: Request) {
  const ctx = await getSmartPickerContext();
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
  // Admins have unlimited credits — never pre-checked and never charged below.
  const balance = await getBalance(ctx.userId);
  if (!ctx.isAdmin && balance < count) {
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
    admin.from("profiles").select("persona, rating_focus").eq("id", ctx.userId).maybeSingle()
  ]);
  const byId = new Map(shoes.map((shoe) => [shoe.id, shoe]));
  const usingDemo = shoes === demoShoes; // getShoes() returns demoShoes by reference when the DB is empty/unreachable
  const rawPersona = profileRow?.persona;
  const persona: Persona | null = isValidPersona(rawPersona) ? rawPersona : null;
  const rawFocus = profileRow?.rating_focus;
  const focus: RatingFocus | null = isValidFocus(rawFocus) ? rawFocus : null;

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

  // Resolve each AI-provided name to a catalog shoe; de-duplicate. Recompute the
  // star as a strict 1-5 blend of the AI's star and a preference-weighted spec
  // score, then sort by that blended star and cap at the paid count.
  // Only surface references backed by a real, successful web search in the SAME
  // turn that produced this answer. The loop stamps loopExitReason "success"
  // only when it produced the result with live search results in context; any
  // other path (bailed loop → JSON-mode fallback, no search, or failed search)
  // means the model invented the URLs from memory, so drop them.
  const refsTrustworthy =
    result.loopExitReason === "success" && (result.searchStats?.succeeded ?? 0) > 0;
  const seen = new Set<string>();
  const matched: RecommendationRaw[] = [];
  for (const rec of result.recommendations) {
    const shoe = matchShoeByName(rec.name, shoes);
    if (!shoe || seen.has(shoe.id)) continue;
    seen.add(shoe.id);
    matched.push({
      shoe_id: shoe.id,
      stars: blendedRecommendationStars(rec.stars, shoe.spec, focus),
      reason: rec.reason,
      pros: rec.pros,
      cons: rec.cons,
      ...(refsTrustworthy && rec.references && rec.references.length > 0 ? { references: rec.references } : {})
    });
  }
  matched.sort((a, b) => b.stars - a.stars);
  // Hard-cap at `count` (the UI-selected number, single source of truth) — the
  // AI is instructed to honor it but slice defensively so a misbehaving model
  // can never bill the user for more than they asked.
  const validRaw: RecommendationRaw[] = matched.slice(0, count);
  const charge = validRaw.length;

  // Charge only for shoes actually recommended. Admins are never charged.
  let newBalance = balance;
  if (!ctx.isAdmin && charge > 0) {
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
    matched: charge,
    search: result.searchStats
      ? {
          attempts: result.searchStats.attempts,
          succeeded: result.searchStats.succeeded,
          failed: result.searchStats.failures.length,
          kinds: Array.from(new Set(result.searchStats.failures.map((f) => f.kind)))
        }
      : undefined
  });

  let replyText = result.reply.trim() || (charge > 0 ? "为你推荐如下：" : "暂时没有找到匹配的鞋款，换个描述再试试？");
  if (charge === 0) {
    const r = result.recommendations.length;
    replyText += `（检索了 ${shoes.length} 双库内鞋款；AI 返回 ${r} 条建议${r > 0 ? "，但都没匹配到库内鞋款（名称对不上或型号未收录）" : ""}）`;
    // Surface Bocha / search diagnostics into the reply itself — Vercel's
    // function logs sometimes drop console.warn output, and zero-match cases
    // are exactly when the operator needs to see what happened upstream.
    const stats = result.searchStats;
    const reasonZh: Record<string, string> = {
      success: "工具调用成功但鞋名都没匹配上目录",
      prose_no_tools: "模型只输出 prose，没调用任何工具（PACKY 转换问题或 prompt 没约束住）",
      max_iterations: "搜索 3 次后仍未调用 recommend_shoes",
      no_search_no_recs: "模型只调了 recommend_shoes 但参数无效",
      no_choice_message: "上游响应里没有 message 字段（PACKY/Base URL 配错）",
      api_error: "client.create 抛错（PACKY 拒绝了 tool_choice/web_search 等）"
    };
    let searchInfo: string;
    if (!isBochaConfigured()) {
      searchInfo = "Bocha 未配置（BOCHA_API_KEY 缺失或未 redeploy）";
    } else if (stats && stats.attempts > 0) {
      searchInfo = `搜索 ${stats.attempts} 次（成功 ${stats.succeeded}）${
        stats.failures.length ? ` · 失败: ${Array.from(new Set(stats.failures.map((f) => f.kind))).join("/")}` : ""
      }`;
    } else {
      const reason = result.loopExitReason ?? "unknown";
      searchInfo = `tool loop 退出: ${reason}${reasonZh[reason] ? `（${reasonZh[reason]}）` : ""}`;
    }
    replyText += `\n🔧 诊断: ${searchInfo}`;
    if (result.raw) replyText += `\nAI原文片段：${result.raw.slice(0, 300)}`;
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
      credits_charged: ctx.isAdmin ? 0 : charge
    })
    .select("id, role, content, recommendations, credits_charged, created_at")
    .single();
  if (assistantErr || !assistantRow) {
    return NextResponse.json({ ok: false, message: "Failed to save reply." }, { status: 500 });
  }

  // Title the chat on the first turn — prefer the AI-summarized title (returned
  // alongside recommendations in the same call), fall back to a slice of the
  // user message if the model omitted it.
  const chatUpdate: Record<string, string> = { updated_at: new Date().toISOString() };
  if (!chat.title) {
    const aiTitle = result.title?.trim();
    chatUpdate.title = (aiTitle && aiTitle.length > 0 ? aiTitle : message.trim()).slice(0, 30);
  }
  await admin.from("ai_chats").update(chatUpdate).eq("id", chatId);

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
    unlimited: ctx.isAdmin,
    charge
  });
}
