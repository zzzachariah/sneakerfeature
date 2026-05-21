import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { getBalance } from "@/lib/ai/credits";
import { getCheckinStatus } from "@/lib/ai/checkin";

export async function GET() {
  const ctx = await getSmartPickerContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const [balance, checkin] = await Promise.all([getBalance(ctx.userId), getCheckinStatus(ctx.userId)]);
  return NextResponse.json({ ok: true, balance, checkin });
}
