import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/admin/auth";
import { getBalance } from "@/lib/ai/credits";

export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const balance = await getBalance(ctx.userId);
  return NextResponse.json({ ok: true, balance });
}
