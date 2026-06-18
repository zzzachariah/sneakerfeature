import { NextResponse } from "next/server";
import { z } from "zod";
import { getSmartPickerContext } from "@/lib/ai/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShoes } from "@/lib/data/shoes";
import { demoShoes } from "@/lib/data/demo-shoes";
import { isValidPersona, type Persona } from "@/lib/persona/types";
import { isFootProfile, type FootProfile } from "@/lib/foot-scan/types";
import {
  createPackyClient,
  getPackyEnvReport,
  describePackyEnvProblem,
  getPackyTarget,
  describePackyError
} from "@/lib/ai/packy-client";
import { recommendShoes, enrichRecommendations, matchShoeByName, type ChatTurn } from "@/lib/ai/recommend";
import { deriveDetail, detectReplyLang } from "@/lib/ai/derive-proscons";
import { getAllBloggerReviews } from "@/lib/data/blogger-reviews";
import { pickFallbackShoes } from "@/lib/ai/fallback";
import { getBalance, deductCredits, InsufficientCreditsError } from "@/lib/ai/credits";
import { MAX_RECOMMENDATIONS, type RecommendationRaw, type OnProgress } from "@/lib/ai/types";
import { blendedRecommendationStars, isValidFocus, type RatingFocus } from "@/lib/star-rating";

// Node runtime (Supabase admin + OpenAI SDK); never cache — per-user, streamed,
// side-effecting.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const [{ data: historyRows }, shoes, { data: profileRow }, reviewsByShoe] = await Promise.all([
    admin
      .from("ai_messages")
      .select("role, content, recommendations")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true }),
    getShoes(),
    admin.from("profiles").select("persona, rating_focus").eq("id", ctx.userId).maybeSingle(),
    getAllBloggerReviews()
  ]);
  const byId = new Map(shoes.map((shoe) => [shoe.id, shoe]));
  const usingDemo = shoes === demoShoes; // getShoes() returns demoShoes by reference when the DB is empty/unreachable
  const rawPersona = profileRow?.persona;
  const persona: Persona | null = isValidPersona(rawPersona) ? rawPersona : null;
  // Foot profile lives in its own column (added by a later migration). Fetched
  // separately and tolerantly so the recommender keeps working — with persona
  // intact — even before that migration is applied.
  let footProfile: FootProfile | null = null;
  try {
    const { data: fpRow } = await admin.from("profiles").select("foot_profile").eq("id", ctx.userId).maybeSingle();
    if (fpRow && isFootProfile(fpRow.foot_profile)) footProfile = fpRow.foot_profile;
  } catch {
    /* column not present yet — ignore */
  }
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

  // From here on we stream Server-Sent Events: the AI's prose and search
  // activity are pushed live, then the final cards. Pre-flight failures above
  // stayed JSON; the client branches on Content-Type.
  const encoder = new TextEncoder();
  let aborted = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          aborted = true; // controller closed (client gone) — stop emitting
        }
      };

      // Flush headers / open the pipe immediately so proxies don't buffer.
      send("status", { phase: "start", message: "开始为你挑选…" });

      try {
        const onProgress: OnProgress = (ev) => send(ev.type, ev);

        let result: Awaited<ReturnType<typeof recommendShoes>>;
        try {
          result = await recommendShoes(client, { shoes, history, currentInput: message, count, persona, footProfile, reviewsByShoe }, onProgress);
        } catch (error) {
          console.error("[ai/chat] recommend failed", error);
          const target = getPackyTarget();
          send("error", {
            message: `AI 调用失败：${describePackyError(error)}。请求目标 Base URL：${target.baseURL ?? "(未设置)"}，模型：${target.model}。`
          });
          return;
        }

        // Client left during the (slow) model phase → don't charge or persist.
        if (aborted) return;
        send("status", { phase: "finalizing", message: "整理推荐中…" });

        // Resolve each AI-provided name to a catalog shoe; de-duplicate. Recompute
        // the star as a strict 1-5 blend of the AI's star and a preference-weighted
        // spec score, then sort by that blended star. Only surface references
        // backed by a real, successful web search in the SAME turn (loopExitReason
        // "success"); any other path means the model invented the URLs, so drop them.
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
        // Hard-cap at `count` (the UI-selected number) so a misbehaving model can
        // never bill for more than the user asked.
        let validRaw: RecommendationRaw[] = matched.slice(0, count);

        // GUARANTEE: never return empty. When the AI produced nothing matchable
        // (e.g. the relay never honored tools), deterministically pick the top-N
        // most suitable shoes straight from the catalog so the user always gets
        // cards. Only a truly empty catalog yields zero.
        const fallbackUsed = validRaw.length === 0;
        if (fallbackUsed) {
          validRaw = pickFallbackShoes({ shoes, query: message, persona, focus, count });
        }

        // Guarantee every card carries a reason + 3 pros + 3 cons. The AI's own
        // points come first; gaps (and the deterministic fallback's blanks) are
        // filled from real blogger-review points and the shoe's spec profile, so
        // the reason/pros/cons can never come back empty again.
        const replyLang = detectReplyLang(message);
        validRaw = validRaw.map((raw) => {
          const shoe = byId.get(raw.shoe_id);
          if (!shoe) return raw;
          const detail = deriveDetail({
            shoe,
            reviews: reviewsByShoe[raw.shoe_id] ?? [],
            focus,
            lang: replyLang,
            existing: { reason: raw.reason, pros: raw.pros, cons: raw.cons }
          });
          return { ...raw, reason: detail.reason, pros: detail.pros, cons: detail.cons };
        });

        const charge = validRaw.length;

        // Diagnostics → server logs only (no longer shown to users). Captures the
        // old 🔧 诊断 info so operators can still debug zero-match / prose cases.
        const sstats = result.searchStats;
        console.warn("[ai/chat] catalog", {
          size: shoes.length,
          usingDemo,
          hasPersona: persona !== null,
          aiReturned: result.recommendations.length,
          matched: matched.length,
          fallbackUsed,
          charge,
          loopExitReason: result.loopExitReason ?? null,
          raw: result.raw ? result.raw.slice(0, 300) : null,
          search: sstats
            ? {
                attempts: sstats.attempts,
                succeeded: sstats.succeeded,
                failed: sstats.failures.length,
                kinds: Array.from(new Set(sstats.failures.map((f) => f.kind)))
              }
            : undefined
        });

        // Charge once (admins never charged). Past this point we're committed.
        let newBalance = balance;
        if (!ctx.isAdmin && charge > 0) {
          try {
            newBalance = await deductCredits(ctx.userId, charge);
          } catch (error) {
            if (error instanceof InsufficientCreditsError) {
              send("error", { message: `积分不足（当前余额 ${error.balance}）。每日签到可领取免费积分。` });
              return;
            }
            console.error("[ai/chat] deduct failed", error);
            send("error", { message: "扣费失败，请重试。" });
            return;
          }
        }

        // User-facing reply text — no diagnostics. The deterministic fallback gets
        // a gentle note instead of the old "暂时没有找到匹配的鞋款" error.
        let replyText: string;
        if (fallbackUsed && charge > 0) {
          replyText = "根据你的描述，这几双可能比较合适（综合场上定位、脚型与性能匹配挑选）：";
        } else {
          replyText = result.reply.trim() || (charge > 0 ? "为你推荐如下：" : "暂时没有找到匹配的鞋款，换个描述再试试？");
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
          send("error", { message: "Failed to save reply." });
          return;
        }

        // Title the chat on the first turn — prefer the AI-summarized title, fall
        // back to a slice of the user message.
        const chatUpdate: Record<string, string> = { updated_at: new Date().toISOString() };
        if (!chat.title) {
          const aiTitle = result.title?.trim();
          chatUpdate.title = (aiTitle && aiTitle.length > 0 ? aiTitle : message.trim()).slice(0, 30);
        }
        await admin.from("ai_chats").update(chatUpdate).eq("id", chatId);

        // Stream the cards, then `done` (which carries the final reply as
        // `content`). The reply is NOT sent as a `text` step — that would fold it
        // into the live "thinking" timeline; it belongs in the answer bubble.
        send("recommendations", { items: enrichRecommendations(validRaw, byId) });
        send("done", {
          assistantMessageId: assistantRow.id,
          userMessageId: userMessage.id,
          content: replyText,
          createdAt: assistantRow.created_at,
          creditsCharged: assistantRow.credits_charged,
          balance: newBalance,
          unlimited: ctx.isAdmin,
          charge,
          title: chatUpdate.title ?? null,
          fallbackUsed
        });
      } catch (error) {
        console.error("[ai/chat] stream failed", error);
        send("error", { message: "请求失败，请稍后重试。" });
      } finally {
        if (!aborted) {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      }
    },
    cancel() {
      aborted = true;
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
