import { getModelCatalog } from "@/lib/ai/model-catalog-server";
import { catalogModel } from "@/lib/ai/model-catalog";
import { NextResponse } from "next/server";
import { reserveAiRequest } from "@/lib/ai/reservations";
import { z } from "zod";
import { getSmartPickerContext } from "@/lib/ai/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShoes, getFreshPublicShoes } from "@/lib/data/shoes";
import { clarificationSubmissionSchema, validateClarificationAnswers, clarificationRecommendationInput, clarificationResearchFocus, clarificationPriceFocus, type AiClarification } from "@/lib/ai/clarification";
import { readChatClarification, publicClarification, prepareChatClarification, clarificationResponse, type ClarificationRow } from "@/lib/ai/clarification-server";
import { demoShoes } from "@/lib/data/demo-shoes";
import { isValidPersona, type Persona } from "@/lib/persona/types";
import { isFootProfile, type FootProfile } from "@/lib/foot-scan/types";
import {
  createPackyClientForModel,
  getPackyActualModel,
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
  chatId: z.guid(),
  message: z.string().trim().min(1, "Message is required.").max(2000),
  count: z.number().int().min(1).max(MAX_RECOMMENDATIONS),
  // Model chosen in the picker for THIS request. Optional — absent (or not
  // supported by the member's tier) falls back to the saved pref / tier default.
  model: z.string().max(64).optional(),
  clarification: clarificationSubmissionSchema.optional()
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
  const { chatId, clarification: answerSubmission } = parsed.data;
  let { message, count, model: requestedModel } = parsed.data;
  const displayMessage = message;

  // The turn's language, decided ONCE from what the user just typed, then
  // threaded through everything downstream: the per-tier depth suffix, the
  // history annotations, every app-authored reply/error string, and the AI
  // pipeline itself. Follow-ups re-derive it from the newest message, so a user
  // can switch languages mid-thread and the answer follows.
  let replyLang = detectReplyLang(message);
  let zhReply = replyLang === "zh";

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  // Verify chat ownership.
  const { data: chat } = await admin.from("ai_chats").select("id, user_id, title").eq("id", chatId).maybeSingle();
  if (!chat || chat.user_id !== ctx.userId) {
    return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
  }

  // Read only the request and the actual account profile before clarification.
  // The catalog and blogger evidence are deliberately not loaded until answers.
  const [{ data: historyRows, error: historyError }, { data: profileRow }] = await Promise.all([
    admin.from("ai_messages").select("role, content, recommendations").eq("chat_id", chatId).order("created_at", { ascending: true }),
    admin.from("profiles").select("persona, rating_focus").eq("id", ctx.userId).maybeSingle()
  ]);
  if (historyError) return NextResponse.json({ok:false,message:"Conversation unavailable."},{status:503});
  let persona: Persona | null = isValidPersona(profileRow?.persona) ? profileRow.persona : null;
  let footProfile: FootProfile | null = null;
  try { const {data:row}=await admin.from("profiles").select("foot_profile").eq("id",ctx.userId).maybeSingle();if(isFootProfile(row?.foot_profile))footProfile=row.foot_profile; } catch { /* Optional legacy column. */ }
  let focus: RatingFocus | null = isValidFocus(profileRow?.rating_focus) ? profileRow.rating_focus : null;
  let clarificationRow: ClarificationRow | null;
  try { clarificationRow = await readChatClarification(admin,chatId,ctx.userId); }
  catch { return NextResponse.json({ok:false,message:"Preferences are temporarily unavailable."},{status:503}); }
  const hasRecommendations=(historyRows??[]).some(row=>Array.isArray(row.recommendations)&&row.recommendations.length>0);
  let confirmedState: AiClarification | null = clarificationRow?.status==="complete"&&clarificationRow.answers?publicClarification(clarificationRow):null;
  if(answerSubmission){
    if(!clarificationRow||clarificationRow.id!==answerSubmission.id)return NextResponse.json({ok:false,message:"These questions no longer match this conversation."},{status:409});
    if(clarificationRow.status!=="awaiting_answers")return NextResponse.json(await clarificationResponse(admin,clarificationRow));
    try { const state=publicClarification(clarificationRow);confirmedState={...state,answers:validateClarificationAnswers(state.questions,answerSubmission.answers)}; }
    catch(error){return NextResponse.json({ok:false,message:error instanceof Error?error.message:"Invalid answers."},{status:400});}
    // Save validated input before balance/catalog checks so recovery keeps it.
    const savedAnswers = await admin.from("ai_chat_clarifications").update({ answers: confirmedState.answers }).eq("id", clarificationRow.id).eq("user_id", ctx.userId).eq("status", "awaiting_answers");
    if (savedAnswers.error) return NextResponse.json({ ok: false, message: "Your answers could not be saved. Please retry." }, { status: 503 });
    message=clarificationRecommendationInput(confirmedState,undefined,clarificationRow.context);
    count=clarificationRow.requested_count;requestedModel=clarificationRow.model;replyLang=clarificationRow.lang;zhReply=replyLang==="zh";
  }else if(clarificationRow&&clarificationRow.status!=="complete"&&clarificationRow.status!=="failed"){
    return NextResponse.json(await clarificationResponse(admin,clarificationRow));
  }else if(confirmedState&&clarificationRow){
    message=clarificationRecommendationInput(confirmedState,displayMessage,clarificationRow.context);
  }
  // Explicit corrections win over all previously stored scoring/profile hints.
  if(confirmedState?.answers?.choices.profile==="adjust"){persona=null;footProfile=null;focus=null;}
  const needsQuestions=!hasRecommendations&&!confirmedState&&!answerSubmission;
  if (needsQuestions && clarificationRow?.status === "failed") {
    count = clarificationRow.requested_count;
    requestedModel = clarificationRow.model;
    replyLang = clarificationRow.lang;
    zhReply = replyLang === "zh";
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
  if(needsQuestions){
    let actualModel: string;
    try { actualModel = catalogModel(await getModelCatalog(), model)!.model; }
    catch { return NextResponse.json({ ok: false, message: "AI model configuration is temporarily unavailable." }, { status: 503 }); }
    const questionClient=createPackyClientForModel(model, actualModel);
    if(!questionClient)return NextResponse.json({ok:false,message:"AI questions are temporarily unavailable."},{status:503});
    try {
      const result=await prepareChatClarification({db:admin,request,userId:ctx.userId,chatId,message:displayMessage,count:effectiveCount,model,actualModel,lang:replyLang,context:{persona,footProfile,ratingFocus:focus},client:questionClient,existing:clarificationRow});
      if(result instanceof Response)return result;
      return NextResponse.json({...result,balance:await getBalance(ctx.userId),unlimited:ctx.isAdmin||cfg.capabilities.baseUnlimited,tier,model});
    }catch{return NextResponse.json({ok:false,message:"Could not prepare the questions. Please retry."},{status:503});}
  }

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
  let actualModel: string;
  let fallbackModel: string | undefined;
  try { const selected = catalogModel(await getModelCatalog(), model)!; actualModel = selected.model; fallbackModel = selected.fallback?.model; }
  catch { return NextResponse.json({ ok: false, message: "AI model configuration is temporarily unavailable." }, { status: 503 }); }
  const client = createPackyClientForModel(model, actualModel, fallbackModel);
  if (!client) {
    const report = getPackyEnvReport(clientOptionsForModel(model));
    console.error("[ai/chat] packyapi not configured", { model, apiKey: report.apiKey, baseURL: report.baseURL });
    return NextResponse.json({ ok: false, message: describePackyEnvProblem(report, clientOptionsForModel(model)) }, { status: 503 });
  }

  let shoes: Awaited<ReturnType<typeof getShoes>>;
  let reviewsByShoe: Awaited<ReturnType<typeof getAllBloggerReviews>>;
  try { [shoes,reviewsByShoe]=await Promise.all([confirmedState?getFreshPublicShoes():getShoes(),getAllBloggerReviews()]); }
  catch { return NextResponse.json({ok:false,message:"The current catalog could not be loaded. Your answers are saved."},{status:503}); }
  const byId=new Map(shoes.map(shoe=>[shoe.id,shoe]));
  const usingDemo=shoes===demoShoes;

  // Build prior LLM turns; surface previously-recommended shoe names so follow-ups
  // ("第一双太贵了") have context. The same names are collected structurally into
  // `priorRecommendations`, which is what actually drives the follow-up prompt:
  // the model is told exactly what it recommended last turn and asked to either
  // double down on those or replace them — not to answer from scratch.
  const allPriorNames: string[] = [];
  let lastPriorNames: string[] = [];
  const history: ChatTurn[] = (answerSubmission ? [] : historyRows ?? []).map((row) => {
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

  let answerClaimed=false;
  let userMessage:{id:string};
  if(answerSubmission&&clarificationRow&&confirmedState?.answers){
    const answerText=confirmedState.questions.map(q=>`${q.prompt[replyLang]} ${q.options.find(o=>o.value===confirmedState!.answers!.choices[q.id])?.label[replyLang]??""}`).join("\n")+(confirmedState.answers.note?`\n${confirmedState.answers.note}`:"");
    const claim=await admin.rpc("claim_ai_chat_clarification_answer",{p_id:clarificationRow.id,p_chat_id:chatId,p_user_id:ctx.userId,p_request_id:reservation.id,p_answers:confirmedState.answers,p_content:answerText});
    if(claim.error||!claim.data){await reservation.refund();return NextResponse.json({ok:false,message:"Your answers could not be submitted. Please retry."},{status:503});}
    const value=claim.data as {claimed:boolean;row:ClarificationRow};clarificationRow=value.row;
    if(!value.claimed){await reservation.refund();return NextResponse.json(await clarificationResponse(admin,clarificationRow));}
    answerClaimed=true;userMessage={id:clarificationRow.answer_message_id!};
  }else{
    const {data:user,error}=await admin.from("ai_messages").insert({chat_id:chatId,role:"user",content:displayMessage,credits_charged:0}).select("id").single();
    if(error||!user){await reservation.refund();return NextResponse.json({ok:false,message:"Failed to save message."},{status:500});}userMessage=user;
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
              model: actualModel,
              depthSuffix,
              priorRecommendations,
              deadline,
              replyLanguage: replyLang,
              confirmedPreferences: Boolean(confirmedState),
              researchFocus: confirmedState?clarificationResearchFocus(confirmedState, answerSubmission ? undefined : displayMessage):undefined,
              priceResearchFocus: confirmedState?clarificationPriceFocus(confirmedState, answerSubmission ? undefined : displayMessage):undefined
            },
            onProgress
          );
          actualModel = getPackyActualModel(client, actualModel);
        } catch (error) {
          actualModel = getPackyActualModel(client, actualModel);
          console.error("[ai/chat] recommend failed", { model: actualModel, elapsedMs: Date.now() - startedAt, error });
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
            stars: confirmedState ? rec.stars : blendedRecommendationStars(rec.stars, shoe.spec, focus),
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
        if (confirmedState && fallbackUsed) throw new Error("No verified recommendations were returned");
        if (fallbackUsed) validRaw = pickFallbackShoes({ shoes, query: message, persona, focus, count: effectiveCount });

        // Fill only evidence-backed details. Short lists are more honest than filler.
        validRaw = validRaw.map((raw) => {
          const shoe = byId.get(raw.shoe_id);
          if (!shoe) return raw;
          const detail = deriveDetail({
            shoe,
            reviews: reviewsByShoe[raw.shoe_id] ?? [],
            focus: confirmedState ? null : focus,
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
          model: actualModel,
          size: shoes.length,
          usingDemo,
          hasPersona: persona !== null,
          aiReturned: result.recommendations.length,
          matched: matched.length,
          fallbackUsed,
          charge,
          loopExitReason: result.loopExitReason ?? null,
          raw: confirmedState ? null : result.raw ? result.raw.slice(0, 300) : null,
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
        const followUp = fallbackUsed || confirmedState ? "" : (result.followUp ?? "").trim();

        const assistantRow = await reservation.complete(chatId, replyText, chargedAmount, validRaw.length ? validRaw : null, followUp || null);
        const newBalance = assistantRow.balance;
        if (answerClaimed && clarificationRow) {
          // Settlement is atomic with the reply. Never reopen a settled answer
          // if this metadata write fails; GET repairs it from the receipt.
          answerClaimed = false;
          await admin.from("ai_chat_clarifications").update({ status: "complete", error: null }).eq("id", clarificationRow.id).eq("request_id", reservation.id).eq("status", "answering");
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
          actualModel,
          charge,
          title: chatUpdate.title ?? null,
          fallbackUsed
        });
      } catch (error) {
        // Anything that escapes the pipeline's own handling (persistence, a
        // malformed catalog row…). The old text was a bare "请求失败，请稍后重试。",
        // which is indistinguishable from a dropped connection and told nobody
        // anything — report what actually broke, like the AI-call path does.
        console.error("[ai/chat] stream failed", { model: actualModel, error });
        send("error", {
          message: pick(
            replyLang,
            "请求未完成，请稍后重试。",
            "The request could not be completed. Please try again."
          )
        });
      } finally {
        await reservation.refund();
        if(answerClaimed&&clarificationRow)await admin.from("ai_chat_clarifications").update({status:"awaiting_answers",error:"recommendations_unavailable"}).eq("id",clarificationRow.id).eq("request_id",reservation.id).eq("status","answering");
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
