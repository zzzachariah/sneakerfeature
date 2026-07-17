import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { getBalance } from "@/lib/ai/credits";
import { getCheckinStatus } from "@/lib/ai/checkin";
import { getMemberContext, getAllowanceBalance } from "@/lib/subscription/entitlements";
import { isPaidTier, tierConfig } from "@/lib/subscription/tiers";

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

  return NextResponse.json({ ok: true, balance, unlimited: ctx.isAdmin, checkin, allowance });
}
