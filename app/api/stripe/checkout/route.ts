import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe/server";
import { getCurrentProfile } from "@/lib/data/auth";
import { productFor } from "@/lib/subscription/stripe-prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  tier: z.enum(["pro", "max"]),
  duration: z.enum(["monthly", "quarterly", "yearly", "permanent"])
});

function siteOrigin(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL || "https://snkrfeature.com").trim().replace(/\/+$/, "");
  // Stripe requires an explicit scheme on success/cancel URLs. Tolerate a
  // scheme-less env value (e.g. "snkrfeature.com") by defaulting to https.
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

// Creates a HOSTED Checkout Session for the signed-in member and returns its
// url — the client redirects the browser to Stripe's hosted page. One-time
// payment (mode: "payment") — durations are "time passes" fulfilled by our own
// expiry logic, not Stripe subscriptions, which also keeps Alipay / WeChat Pay
// usable. Enabled payment methods come from the account's Dashboard settings.
export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ ok: false, message: "请先登录后再开通会员。" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "请选择有效的会员档位与时长。" }, { status: 400 });
  }
  const { tier, duration } = parsed.data;

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ ok: false, message: "支付尚未配置，请稍后再试。" }, { status: 500 });
  }

  try {
    // Resolve the product's default price at request time (fall back to its
    // single active price) so re-pricing in the Dashboard needs no code change.
    const productId = productFor(tier, duration);
    const product = await stripe.products.retrieve(productId);
    let priceId =
      typeof product.default_price === "string" ? product.default_price : product.default_price?.id;
    if (!priceId) {
      const prices = await stripe.prices.list({ product: productId, active: true, limit: 1 });
      priceId = prices.data[0]?.id;
    }
    if (!priceId) {
      return NextResponse.json(
        { ok: false, message: "该档位暂未配置价格，请联系客服。" },
        { status: 500 }
      );
    }

    const metadata = { userId: profile.id, tier, duration };
    const origin = siteOrigin();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: profile.id,
      metadata,
      payment_intent_data: { metadata },
      success_url: `${origin}/subscribe/complete?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscribe`
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (error) {
    console.error("[stripe/checkout] failed", error);
    // Surface the underlying Stripe reason so config problems (test/live key
    // mismatch, inactive account, no enabled payment methods) are visible in the
    // UI. Safe while /subscribe is admin-only (NEXT_PUBLIC_SUBSCRIBE_LIVE unset);
    // tighten this once checkout is open to the public.
    const detail =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "")
        : "";
    return NextResponse.json(
      { ok: false, message: detail ? `创建支付会话失败：${detail}` : "创建支付会话失败，请重试。" },
      { status: 500 }
    );
  }
}
