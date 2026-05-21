import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminContext } from "@/lib/admin/auth";
import { approvePaymentOrderManually, rejectPaymentOrder } from "@/lib/ai/payment-orders";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.string().min(1).max(500) })
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 }
    );
  }

  if (parsed.data.action === "approve") {
    const r = await approvePaymentOrderManually({ orderId: id, adminUserId: ctx.userId });
    if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: 400 });
    return NextResponse.json({ ok: true, balance: r.balance, credits: r.credits });
  }
  const r = await rejectPaymentOrder({ orderId: id, adminUserId: ctx.userId, reason: parsed.data.reason });
  if (!r.ok) return NextResponse.json({ ok: false, message: r.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
