import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { getPackage } from "@/lib/ai/packages";
import { grantCredits } from "@/lib/ai/credits";

const schema = z.object({ packageId: z.string().min(1) });

// Trial mode: no real payment. "完成支付" grants credits immediately.
export async function POST(request: Request) {
  const ctx = await getAdminContext();
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

  const pkg = getPackage(parsed.data.packageId);
  if (!pkg) return NextResponse.json({ ok: false, message: "Unknown package." }, { status: 400 });

  try {
    const balance = await grantCredits(ctx.userId, pkg.credits, pkg.label);
    return NextResponse.json({ ok: true, balance, credits: pkg.credits });
  } catch (error) {
    console.error("[ai/recharge] grant failed", error);
    return NextResponse.json({ ok: false, message: "Failed to grant credits." }, { status: 500 });
  }
}
