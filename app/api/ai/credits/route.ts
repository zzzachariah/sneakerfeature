import { NextResponse } from "next/server";
import { getSmartPickerContext } from "@/lib/ai/access";
import { getBalance } from "@/lib/ai/credits";

export async function GET() {
  const ctx = await getSmartPickerContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const balance = await getBalance(ctx.userId);
  return NextResponse.json({ ok: true, balance });
}
