import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { claimDailyCheckin, getCheckinStatus } from "@/lib/ai/checkin";

export async function POST() {
  const ctx = await getSmartPickerContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const result = await claimDailyCheckin(ctx.userId);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        message: "Daily bonus already claimed.",
        checkin: { canClaim: false, nextClaimAt: result.nextClaimAt, dailyAmount: 3 }
      },
      { status: 409 }
    );
  }
  const checkin = await getCheckinStatus(ctx.userId);
  return NextResponse.json({ ok: true, balance: result.balance, credits: result.credits, checkin });
}
