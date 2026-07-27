import { NextResponse } from "next/server";
import { z } from "zod";
import { getSmartPickerContext } from "@/lib/ai/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getShoes } from "@/lib/data/shoes";
import { isValidPersona, type Persona } from "@/lib/persona/types";
import { isFootProfile, type FootProfile } from "@/lib/foot-scan/types";
import {
  createPackyClientForModel,
  clientOptionsForModel,
  getPackyEnvReport,
  describePackyEnvProblem,
  describePackyTarget,
  describePackyError
} from "@/lib/ai/packy-client";
import { tierConfig } from "@/lib/subscription/tiers";
import {
  getMemberContext,
  getAllowanceBalance,
  spendAllowance,
  InsufficientAllowanceError
} from "@/lib/subscription/entitlements";
import { streamAdvice, type AdvisorTurn } from "@/lib/ai/advisor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The advisor is a Max flagship. Each reply spends this many allowance credits;
// Max's 1500/month grant makes it effectively unlimited for real use while still
// giving the meter something to show. Admins run unmetered.
const ADVISOR_MESSAGE_COST = 1;

// In-memory sliding-window rate limit: 20 messages/min per user.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, number[]>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitStore.get(userId) ?? []).filter((t) => t > windowStart);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitStore.set(userId, timestamps);
  return true;
}

const schema = z.object({
  chatId: z.string().uuid(),
  message: z.string().trim().min(1, "Message is required.").max(2000)
});

export async function POST(request: Request) {
  const ctx = await getSmartPickerContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  if (!checkRateLimit(ctx.userId)) {
    return NextResponse.json({ ok: false, message: "Too many requests." }, { status: 429 });
  }

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
  const { chatId, message } = parsed.data;

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  // Gate to Max (admins resolve to Max). Pro/free are blocked at the API too,
  // not just the UI.
  const member = await getMemberContext(ctx.userId);
  const tier = ctx.isAdmin ? "max" : member.tier;
  if (tier !== "max") {
    return NextResponse.json({ ok: false, code: "locked", message: "The AI advisor is a Max feature." }, { status: 403 });
  }
  const cfg = tierConfig(tier);
  // The advisor always runs the flagship premium model.
  const model = cfg.capabilities.premiumModel ?? cfg.baseModel;

  // Verify chat ownership.
  const { data: chat } = await admin.from("advisor_chats").select("id, user_id, title").eq("id", chatId).maybeSingle();
  if (!chat || chat.user_id !== ctx.userId) {
    return NextResponse.json({ ok: false, message: "Chat not found." }, { status: 404 });
  }

  // Allowance pre-check (admins are unmetered).
  let preBalance = 0;
  if (!ctx.isAdmin) {
    preBalance = await getAllowanceBalance(ctx.userId, tier);
    if (preBalance < ADVISOR_MESSAGE_COST) {
      return NextResponse.json({ ok: true, insufficient: true, balance: preBalance });
    }
  }

  const client = createPackyClientForModel(model);
  if (!client) {
    const report = getPackyEnvReport(clientOptionsForModel(model));
    return NextResponse.json(
      { ok: false, message: describePackyEnvProblem(report, clientOptionsForModel(model)) },
      { status: 503 }
    );
  }

  // Load prior turns + catalog + persona in parallel.
  const [{ data: historyRows }, shoes, { data: profileRow }] = await Promise.all([
    admin.from("advisor_messages").select("role, content").eq("chat_id", chatId).order("created_at", { ascending: true }),
    getShoes(),
    admin.from("profiles").select("persona").eq("id", ctx.userId).maybeSingle()
  ]);
  const persona: Persona | null = isValidPersona(profileRow?.persona) ? (profileRow?.persona as Persona) : null;
  let footProfile: FootProfile | null = null;
  try {
    const { data: fpRow } = await admin.from("profiles").select("foot_profile").eq("id", ctx.userId).maybeSingle();
    if (fpRow && isFootProfile(fpRow.foot_profile)) footProfile = fpRow.foot_profile;
  } catch {
    /* column not present yet */
  }
  const history: AdvisorTurn[] = (historyRows ?? []).map((r) => ({
    role: r.role as "user" | "assistant",
    content: r.content as string
  }));

  // Persist the user message before streaming.
  const { data: userMessage, error: userErr } = await admin
    .from("advisor_messages")
    .insert({ chat_id: chatId, user_id: ctx.userId, role: "user", content: message, allowance_charged: 0 })
    .select("id, created_at")
    .single();
  if (userErr || !userMessage) {
    return NextResponse.json({ ok: false, message: "Failed to save message." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  let aborted = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          aborted = true;
        }
      };

      const heartbeat = setInterval(() => {
        if (aborted) return;
        try {
          controller.enqueue(encoder.encode(":hb\n\n"));
        } catch {
          aborted = true;
        }
      }, 10_000);

      try {
        let full = "";
        try {
          const result = await streamAdvice(client, { shoes, history, message, persona, footProfile, model }, (delta) => {
            full += delta;
            send("delta", { text: delta });
          });
          full = result.text || full;
        } catch (error) {
          console.error("[ai/advisor] stream failed", { model, error });
          // The advisor always runs the premium model — report that one, not the
          // shared base model the old hardcoded target reported.
          send("error", { message: `AI 调用失败：${describePackyError(error)}。请求目标 ${describePackyTarget(model)}。` });
          return;
        }

        if (aborted) return;

        const replyText = full.trim() || "抱歉，我这次没能给出建议，换个说法再问我一次？";

        // Charge the allowance (admins unmetered). The reply is already produced,
        // so a rare concurrent drain doesn't hard-fail — report best-effort.
        let newBalance = preBalance;
        const charged = ctx.isAdmin ? 0 : ADVISOR_MESSAGE_COST;
        if (charged > 0) {
          try {
            newBalance = await spendAllowance(ctx.userId, charged, tier);
          } catch (error) {
            if (error instanceof InsufficientAllowanceError) newBalance = 0;
            else console.error("[ai/advisor] allowance spend failed", error);
          }
        }

        const { data: assistantRow, error: assistantErr } = await admin
          .from("advisor_messages")
          .insert({
            chat_id: chatId,
            user_id: ctx.userId,
            role: "assistant",
            content: replyText,
            allowance_charged: charged
          })
          .select("id, created_at")
          .single();
        if (assistantErr || !assistantRow) {
          send("error", { message: "Failed to save reply." });
          return;
        }

        // Title the chat on the first turn from the user's opening message.
        const chatUpdate: Record<string, string> = { updated_at: new Date().toISOString() };
        if (!chat.title) chatUpdate.title = message.trim().slice(0, 30);
        await admin.from("advisor_chats").update(chatUpdate).eq("id", chatId);

        send("done", {
          assistantMessageId: assistantRow.id,
          userMessageId: userMessage.id,
          content: replyText,
          createdAt: assistantRow.created_at,
          balance: newBalance,
          unlimited: ctx.isAdmin,
          title: chatUpdate.title ?? null
        });
      } catch (error) {
        console.error("[ai/advisor] handler failed", error);
        send("error", { message: "请求失败，请稍后重试。" });
      } finally {
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
