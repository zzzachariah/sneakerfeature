import { NextResponse } from "next/server";
import { reserveAiRequest } from "@/lib/ai/reservations";
import { z } from "zod";
import { getSmartPickerContext } from "@/lib/ai/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShoes } from "@/lib/data/shoes";
import { demoShoes } from "@/lib/data/demo-shoes";
import { isValidPersona, type Persona } from "@/lib/persona/types";
import { isFootProfile, type FootProfile } from "@/lib/foot-scan/types";
import {
  createPackyClientForModel,
  clientOptionsForModel,
  getPackyEnvReport,
  describePackyEnvProblem
} from "@/lib/ai/packy-client";
import { tierConfig, tierSupportsModel, isAllowanceMetered, type ModelId } from "@/lib/subscription/tiers";
import { resolveModelChoice } from "@/lib/subscription/resolve";
import {
  getMemberContext,
  getAllowanceBalance
} from "@/lib/subscription/entitlements";
import { buildDepthSuffix } from "@/lib/ai/tier-prompt";
import { startDeadline } from "@/lib/ai/budget";
import {
  recommendShoes,
  enrichRecommendations,
  matchShoeByName,
  formatReplyParagraphs,
  type ChatTurn,
  type PriorRecommendations
} from "@/lib/ai/recommend";
import { deriveDetail, detectReplyLang } from "@/lib/ai/derive-proscons";
import { alreadyRecommendedTag, pick } from "@/lib/ai/lang";
import { getAllBloggerReviews } from "@/lib/data/blogger-reviews";
import { pickFallbackShoes } from "@/lib/ai/fallback";
import { getBalance } from "@/lib/ai/credits";
import { MAX_RECOMMENDATIONS, type RecommendationRaw, type OnProgress } from "@/lib/ai/types";
import { blendedRecommendationStars, isValidFocus, type RatingFocus } from "@/lib/star-rating";

// Node runtime (Supabase admin + OpenAI SDK); never cache — per-user, streamed,
// side-effecting.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A reasoning model (Opus) legitimately thinks for minutes, and this
// route holds the function open for the whole SSE stream. Without this the
// platform's short default duration killed the request mid-stream — the client
// saw the connection drop after a perfectly good "thinking" phase and showed
// "请求失败，请稍后重试。". Must be a literal for Next's segment-config analysis;
// keep it in sync with AI_ROUTE_MAX_DURATION, which sizes the internal deadline.
export const maxDuration = 300;

const schema = z.object({
  chatId: z.string().uuid(),
  message: z.string().trim().min(1, "Message is required.").max(2000),
  count: z.number().int().min(1).max(MAX_RECOMMENDATIONS),
  // Model chosen in the picker for THIS request. Optional — absent (or not
  // supported by the member's tier) falls back to the saved pref / tier default.
  model: z.string().max(64).optional()
});

type HistoryRow = { role: "user" | "assistant"; content: string; recommendations: RecommendationRaw[] | null };
export async function POST(request: Request) {
  // Everything this request does — DB reads, model calls, persistence — has to
  // fit inside `maxDuration`. The deadline is set from the first line so the AI
  // pipeline knows how much of that it has actually got left.
  const startedAt = Date.now();
  const deadline = startDeadline();
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
  const { chatId, message, count, model: requestedModel } = parsed.data;

  // The turn's language, decided ONCE from what the user just typed, then
  // threaded through everything downstream: the per-tier depth suffix, the
  // history annotations, every app-authored reply/error string, and the AI
  // pipeline itself. Follow-ups re-derive it from the newest message, so a user
  // can switch languages mid-thread and the answer follows.
  const replyLang = detectReplyLang(message);
  const zhReply = replyLang === "zh";

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  // Verify chat ownership.
  const { data: chat } = await admin.from("ai_chats").select("id, user_id, title").eq("id", chatId).maybeSingle();
  if (!chat || chat.user_id !== ctx.userId) {
    return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
  }

  // --- Tiered routing + mixed billing ---------------------------------------
  // Resolve the member's active tier, then decide which model runs and how this
  // request is billed. Admins get the Max experience, unmetered.
  const member = await getMemberContext(ctx.userId);
  const tier = ctx.isAdmin ? "max" : member.tier;
  const cfg = tierConfig(tier);

  // Tier caps the recommendation count (Free 3 / Pro 5 / Max 8).
  const effectiveCount = Math.min(count, cfg.prompt.count);

  // Which model runs: the picker's explicit request wins when the tier supports
  // it, else the saved pref / tier default (legacy modelPref honored). An
  // unsupported id (crafted request or stale client) falls back silently.
  let model: ModelId =
    requestedModel && tierSupportsModel(tier, requestedModel)
      ? (requestedModel as ModelId)
      : resolveModelChoice(tier, member.prefs);
  // Metered by the catalog's premium flag, not by "is this the tier's headline
  // model" — so any premium model the member picks comes out of the allowance,
  // not just the one their plan advertises.
  const premiumSelected = isAllowanceMetered(tier, model);

  type Billing = "credits" | "unlimited" | "allowance";
  let billing: Billing;
  // `preBalance` is the relevant account's balance for the response payload:
  // credits for free, monthly allowance for premium, 0 for unlimited.
  let preBalance = 0;

  if (ctx.isAdmin) {
    // Admins run whatever they picked, unmetered.
    billing = "unlimited";
  } else if (tier === "free") {
    billing = "credits";
    preBalance = await getBalance(ctx.userId);
    if (preBalance < effectiveCount) {
      return NextResponse.json({ ok: true, insufficient: true, balance: preBalance, needed: effectiveCount });
    }
  } else if (premiumSelected) {
    // Paid tier on the premium model: metered by the monthly allowance, with a
    // graceful downgrade to the (unlimited) base model when it's exhausted — so
    // a spent allowance never blocks a paid member, it just changes the model.
    preBalance = await getAllowanceBalance(ctx.userId, tier);
    if (preBalance < effectiveCount) {
      model = cfg.baseModel;
      billing = "unlimited";
    } else {
      billing = "allowance";
    }
  } else {
    // Paid tier on an unmetered (base or lighter) model.
    billing = "unlimited";
  }
  const depthSuffix = buildDepthSuffix(cfg.prompt, replyLang);

  // Fail fast if the AI provider isn't configured (before persisting anything).
  const client = createPackyClientForModel(model);
  if (!client) {
    const report = getPackyEnvReport(clientOptionsForModel(model));
    console.error("[ai/chat] packyapi not configured", { model, apiKey: report.apiKey, baseURL: report.baseURL });
    return NextResponse.json({ ok: false, message: describePackyEnvProblem(report, clientOptionsForModel(model)) }, { status: 503 });
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
  // ("第一双太贵了") have context. The same names are collected structurally into
  // `priorRecommendations`, which is what actually drives the follow-up prompt:
  // the model is told exactly what it recommended last turn and asked to either
  // double down on those or replace them — not to answer from scratch.
  const allPriorNames: string[] = [];
  let lastPriorNames: string[] = [];
  const history: ChatTurn[] = (historyRows ?? []).map((row) => {
    const r = row as HistoryRow;
    if (r.role === "assistant" && Array.isArray(r.recommendations) && r.recommendations.length) {
      const names = r.recommendations
        .map((rec) => byId.get(rec.shoe_id)?.shoe_name)
        .filter((n): n is string => Boolean(n));
      if (names.length) {
        lastPriorNames = names;
        for (const n of names) if (!allPriorNames.includes(n)) allPriorNames.push(n);
      }
      return {
        role: "assistant",
        content: names.length ? `${r.content}\n${alreadyRecommendedTag(replyLang, names)}` : r.content
      };
    }
    return { role: r.role, content: r.content };
  });
  const priorRecommendations: PriorRecommendations = { last: lastPriorNames, all: allPriorNames };

  const reservation = await reserveAiRequest(request, ctx.userId, "chat", billing, effectiveCount);
  if ("error" in reservation) return reservation.error;

  // Persist the user message (after capturing prior history).
  const { data: userMessage, error: userErr } = await admin
    .from("ai_messages")
    .insert({ chat_id: chatId, role: "user", content: message, credits_charged: 0 })
    .select("id, role, content, recommendations, credits_charged, created_at")
    .single();
  if (userErr || !userMessage) {
    await reservation.refund();
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
      // `phase` is the machine-readable key the client localizes; `message` is
      // the human fallback, written in the turn's own language.
      send("status", {
        phase: "start",
        message: pick(replyLang, "开始为你挑选…", "Starting your picks…")
      });

      // SSE comment heartbeat: a thinking model can go 30s+ between real events,
      // and idle streams get buffered or reaped by proxies. Comment frames are
      // invisible to the client parser (no data line) but keep bytes flowing.
      const heartbeat = setInterval(() => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(":hb\n\n"));
        } catch {
          aborted = true;
        }
      }, 10_000);

      try {
        const onProgress: OnProgress = (ev) => send(ev.type, ev);

        let result: Awaited<ReturnType<typeof recommendShoes>>;
        try {
          result = await recommendShoes(
            client,
            {
              shoes,
              history,
              currentInput: message,
              count: effectiveCount,
              persona,
              footProfile,
              reviewsByShoe,
              model,
              depthSuffix,
              priorRecommendations,
              deadline
            },
            onProgress
          );
        } catch (error) {
          console.error("[ai/chat] recommend failed", { model, elapsedMs: Date.now() - startedAt, error });
          // Report the model this request ACTUALLY ran on (`model` may have been
          // downgraded to the base model when the allowance ran out) — the old
          // message hardcoded the shared deepseek id and misattributed every
          // premium-model failure.
          send("error", {
            message: pick(
              replyLang,
              "AI 暂时无法完成请求，请稍后重试。",
              "AI could not complete this request. Please try again later."
            )
          });
          return;
        }

        // Client left during the (slow) model phase → don't charge or persist.
        if (aborted) return;
        send("status", { phase: "finalizing", message: pick(replyLang, "整理推荐中…", "Putting the picks together…") });

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
        matched.sort((a, b) => (b.stars ?? -1) - (a.stars ?? -1));
        // Hard-cap at the tier-effective count so a misbehaving model can never
        // bill for more than allowed.
        let validRaw: RecommendationRaw[] = matched.slice(0, effectiveCount);

        // Keep verified partial results; never pad the answer with unrelated shoes.
        const fallbackUsed = validRaw.length === 0;
        if (fallbackUsed) validRaw = pickFallbackShoes({ shoes, query: message, persona, focus, count: effectiveCount });

        // Fill only evidence-backed details. Short lists are more honest than filler.
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

        const charge = fallbackUsed ? 0 : validRaw.length;

        // Diagnostics → server logs only (no longer shown to users). Captures the
        // old 🔧 诊断 info so operators can still debug zero-match / prose cases.
        const sstats = result.searchStats;
        console.warn("[ai/chat] catalog", {
          // How long the model phase actually took. This is the number to look
          // at when a turn dies mid-stream: if it approaches `maxDuration` the
          // platform, not the relay, is what ended the request.
          elapsedMs: Date.now() - startedAt,
          model,
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

        const chargedAmount = billing === "unlimited" ? 0 : charge;

        // User-facing reply text — no diagnostics. The deterministic fallback gets
        // a gentle note instead of the old "暂时没有找到匹配的鞋款" error. All of
        // these app-authored strings follow the user's input language (replyLang),
        // so the answer matches whatever language the user typed in.
        let replyText: string;
        if (fallbackUsed && validRaw.length > 0) {
          replyText = zhReply
            ? "AI 推荐暂时未完成。以下仅是根据鞋库文字找到的备选，尚未核实是否满足你的全部条件："
            : "AI recommendations could not be completed. These are text-matched catalog alternatives; your full requirements have not been verified:";
        } else {
          const noResult = zhReply
            ? "暂时没有找到匹配的鞋款，换个描述再试试？"
            : "I couldn't find a good match yet — try describing it a bit differently?";
          const gotResult = zhReply ? "为你推荐如下：" : "Here are my picks for you:";
          // Break the model's prose into paragraphs before it is stored, so the
          // reply reads as a few short blocks in the bubble instead of one
          // unbroken wall — and so a reloaded conversation looks identical to
          // the one that was just streamed.
          replyText = fallbackUsed ? noResult : formatReplyParagraphs(result.reply) || (validRaw.length > 0 ? gotResult : noResult);
        }
        if (usingDemo) {
          const demoNote = zhReply
            ? `⚠️当前使用内置示例数据（仅 ${shoes.length} 双），未连接数据库。`
            : `⚠️ Using built-in sample data (${shoes.length} shoes only) — no database connected.`;
          replyText = `${demoNote}\n\n${replyText}`;
        }

        // The one question worth asking next, rendered by the client as its own
        // composer box. Suppressed when the answer itself is a fallback (there's
        // nothing grounded to follow up on) or when the model had nothing to ask.
        const followUp = fallbackUsed ? "" : (result.followUp ?? "").trim();

        const assistantRow = await reservation.complete(chatId, replyText, chargedAmount, validRaw.length ? validRaw : null, followUp || null);
        const newBalance = assistantRow.balance;

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
          followUp,
          createdAt: assistantRow.created_at,
          creditsCharged: assistantRow.credits_charged,
          balance: newBalance,
          // ACCOUNT-level flag, not a per-turn one: "credits never gate this
          // member". `billing` already carries how THIS turn was charged, so
          // deriving this from it would report false for an allowance-billed
          // Pro turn and re-lock the composer at a 0 credit balance.
          unlimited: ctx.isAdmin || cfg.capabilities.baseUnlimited,
          billing,
          tier,
          model,
          charge,
          title: chatUpdate.title ?? null,
          fallbackUsed
        });
      } catch (error) {
        // Anything that escapes the pipeline's own handling (persistence, a
        // malformed catalog row…). The old text was a bare "请求失败，请稍后重试。",
        // which is indistinguishable from a dropped connection and told nobody
        // anything — report what actually broke, like the AI-call path does.
        console.error("[ai/chat] stream failed", { model, error });
        send("error", {
          message: pick(
            replyLang,
            "请求未完成，请稍后重试。",
            "The request could not be completed. Please try again."
          )
        });
      } finally {
        await reservation.refund();
        clearInterval(heartbeat);
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
