import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { getBalance } from "@/lib/ai/credits";
import { getCheckinStatus } from "@/lib/ai/checkin";
import { getMemberContext, getAllowanceBalance } from "@/lib/subscription/entitlements";
import { resolveModelChoice } from "@/lib/subscription/resolve";
import { hasUnmeteredBase, isPaidTier, tierConfig } from "@/lib/subscription/tiers";

export async function GET() {
  const ctx = await getSmartPickerContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const [balance, checkin, member] = await Promise.all([
    getBalance(ctx.userId),
    getCheckinStatus(ctx.userId),
    getMemberContext(ctx.userId)
  ]);

  // Premium-model (Fable) allowance for paid tiers — members otherwise have no
  // way to see how much of their monthly quota is left. Null for free / admins.
  let allowance: { balance: number; grant: number } | null = null;
  const grant = tierConfig(member.tier).capabilities.monthlyAllowance;
  if (isPaidTier(member.tier) && grant > 0) {
    allowance = { balance: await getAllowanceBalance(ctx.userId, member.tier), grant };
  }

  // Tier + effective model selection for the Smart Picker's model chooser.
  // Admins get the Max experience, so the picker unlocks everything for them.
  const tier = ctx.isAdmin ? "max" : member.tier;
  const model = resolveModelChoice(tier, member.prefs);

  // `unlimited` means "credits never gate this member" — the client uses it to
  // enable the composer and render "∞" instead of a balance. Admins qualify, and
  // so does every PAID tier: their base model is unmetered (see the chat route's
  // billing switch), so a 0 credit balance must never stop a Pro/Max member from
  // sending. Reporting only admins here is what left paid members stuck with a
  // disabled send button once their leftover free-tier credits ran out.
  const unlimited = ctx.isAdmin || hasUnmeteredBase(tier);

  return NextResponse.json({ ok: true, balance, unlimited, checkin, allowance, tier, model });
}
