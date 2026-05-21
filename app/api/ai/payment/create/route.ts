import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/data/auth";
import { createPaymentOrder, PAYMENT_ORDER_TTL_MIN } from "@/lib/ai/payment-orders";

const schema = z.object({
  packageId: z.string().min(1),
  paymentMethod: z.enum(["wechat", "alipay"])
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

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

  const result = await createPaymentOrder({
    userId: user.id,
    packageId: parsed.data.packageId,
    paymentMethod: parsed.data.paymentMethod
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, message: result.message }, { status: 400 });
  }

  const o = result.order;
  return NextResponse.json({
    ok: true,
    order: {
      id: o.id,
      verificationCode: o.verification_code,
      amountYuan: Number(o.amount_yuan),
      credits: o.credits,
      packageLabel: o.package_label,
      paymentMethod: o.payment_method,
      expiresAt: o.expires_at,
      ttlMinutes: PAYMENT_ORDER_TTL_MIN
    }
  });
}
