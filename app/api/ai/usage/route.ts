import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBalance } from "@/lib/ai/credits";
import { getCheckinStatus } from "@/lib/ai/checkin";
import { getMemberContext, getAllowanceBalance } from "@/lib/subscription/entitlements";
import { hasUnmeteredBase, isPaidTier, tierConfig } from "@/lib/subscription/tiers";

// Per-user ledger read — never cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How far back the daily spend sparkline reaches, and how many rows the ledger
// list shows. Both bounded so a heavy user can't turn this into a huge payload.
const DAILY_WINDOW_DAYS = 14;
const RECENT_LIMIT = 12;
const TOP_CHATS = 5;
const LEDGER_SCAN_LIMIT = 500;

type LedgerRow = { delta: number; reason: string; package_label: string | null; created_at: string };
type MessageRow = { chat_id: string; credits_charged: number; created_at: string };

/** Ledger reasons that ADD credits, grouped for the "where they came from" split. */
function earnBucket(reason: string): "checkin" | "purchase" | "other" {
  if (reason === "daily_checkin") return "checkin";
  if (reason === "recharge") return "purchase";
  return "other";
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Everything the Smart Picker's credits panel shows: what's left, what came in,
 * what went out, and which conversations ate the most.
 *
 * Two currencies are reported side by side and never mixed:
 *   • `credits`    — the free tier's ai_credits, earned by check-in / purchase.
 *   • `allowance`  — a paid tier's monthly premium-model quota.
 * `perChat` is denominated in whatever each turn actually charged
 * (ai_messages.credits_charged), which is the only per-conversation record that
 * exists — the ledger has no chat_id.
 */
export async function GET() {
  const ctx = await getSmartPickerContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, message: "Database is not configured." }, { status: 500 });

  const since = new Date(Date.now() - DAILY_WINDOW_DAYS * 86_400_000).toISOString();

  const [balance, checkin, member, ledgerRes, chatsRes] = await Promise.all([
    getBalance(ctx.userId),
    getCheckinStatus(ctx.userId),
    getMemberContext(ctx.userId),
    admin
      .from("ai_credit_transactions")
      .select("delta, reason, package_label, created_at")
      .eq("user_id", ctx.userId)
      .order("created_at", { ascending: false })
      .limit(LEDGER_SCAN_LIMIT),
    admin
      .from("ai_chats")
      .select("id, title, created_at")
      .eq("user_id", ctx.userId)
  ]);

  const tier = ctx.isAdmin ? "max" : member.tier;
  const grant = tierConfig(member.tier).capabilities.monthlyAllowance;
  let allowance: { balance: number; grant: number } | null = null;
  if (isPaidTier(member.tier) && grant > 0) {
    allowance = { balance: await getAllowanceBalance(ctx.userId, member.tier), grant };
  }

  const ledger = (ledgerRes.data ?? []) as LedgerRow[];

  // Lifetime totals across the scanned window of the ledger.
  let spent = 0;
  const earned = { checkin: 0, purchase: 0, other: 0 };
  for (const row of ledger) {
    if (row.delta < 0) spent += -row.delta;
    else earned[earnBucket(row.reason)] += row.delta;
  }

  // Per-chat spend, straight off the message ledger (the only place a charge is
  // tied to a conversation). Chats the user deleted no longer resolve to a
  // title, so their turns are folded into a single "deleted" bucket rather than
  // silently vanishing from the totals.
  const chatTitles = new Map<string, string | null>(
    ((chatsRes.data ?? []) as { id: string; title: string | null }[]).map((c) => [c.id, c.title])
  );
  const chatIds = Array.from(chatTitles.keys());
  let messages: MessageRow[] = [];
  if (chatIds.length) {
    const { data } = await admin
      .from("ai_messages")
      .select("chat_id, credits_charged, created_at")
      .in("chat_id", chatIds)
      .gt("credits_charged", 0);
    messages = (data ?? []) as MessageRow[];
  }

  const perChatMap = new Map<string, { credits: number; turns: number; lastAt: string }>();
  for (const m of messages) {
    const entry = perChatMap.get(m.chat_id) ?? { credits: 0, turns: 0, lastAt: m.created_at };
    entry.credits += m.credits_charged;
    entry.turns += 1;
    if (m.created_at > entry.lastAt) entry.lastAt = m.created_at;
    perChatMap.set(m.chat_id, entry);
  }
  const perChat = Array.from(perChatMap.entries())
    .map(([id, v]) => ({ id, title: chatTitles.get(id) ?? null, credits: v.credits, turns: v.turns, lastAt: v.lastAt }))
    .sort((a, b) => b.credits - a.credits)
    .slice(0, TOP_CHATS);

  const turnsTotal = messages.length;
  const chargedTotal = messages.reduce((n, m) => n + m.credits_charged, 0);

  // Daily spend for the sparkline — one entry per day in the window, zero-filled
  // so the chart has an even x-axis instead of collapsing empty days.
  const spendByDay = new Map<string, number>();
  for (const m of messages) {
    if (m.created_at < since) continue;
    const k = dayKey(m.created_at);
    spendByDay.set(k, (spendByDay.get(k) ?? 0) + m.credits_charged);
  }
  const daily: { day: string; credits: number }[] = [];
  for (let i = DAILY_WINDOW_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const k = d.toISOString().slice(0, 10);
    daily.push({ day: k, credits: spendByDay.get(k) ?? 0 });
  }

  const recent = ledger.slice(0, RECENT_LIMIT).map((r) => ({
    delta: r.delta,
    reason: r.reason,
    label: r.package_label,
    at: r.created_at
  }));

  return NextResponse.json({
    ok: true,
    tier,
    unlimited: ctx.isAdmin || hasUnmeteredBase(tier),
    balance,
    allowance,
    checkin,
    totals: {
      spent,
      earned,
      turns: turnsTotal,
      charged: chargedTotal,
      avgPerTurn: turnsTotal > 0 ? Math.round((chargedTotal / turnsTotal) * 10) / 10 : 0
    },
    daily,
    perChat,
    recent
  });
}
