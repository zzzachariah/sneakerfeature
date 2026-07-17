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
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://snkrfeature.com").replace(/\/$/, "");
}

// Creates an EMBEDDED Checkout Session for the signed-in member and returns its
// client_secret. One-time payment (mode: "payment") — durations are "time
// passes" fulfilled by our own expiry logic, not Stripe subscriptions, which
// also keeps Alipay / WeChat Pay (one-time methods) usable.
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
    const session = await stripe.checkout.sessions.create({
      // This SDK's pinned API version names the embedded checkout ui_mode
      // "embedded_page"; its client_secret initializes Stripe.js EmbeddedCheckout.
      ui_mode: "embedded_page",
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      // WeChat Pay needs the client hint; card / Alipay come from the account's
      // enabled payment methods in the Dashboard.
      payment_method_options: { wechat_pay: { client: "web" } },
      client_reference_id: profile.id,
      metadata,
      payment_intent_data: { metadata },
      return_url: `${siteOrigin()}/subscribe/complete?session_id={CHECKOUT_SESSION_ID}`
    });

    return NextResponse.json({ ok: true, clientSecret: session.client_secret });
  } catch (error) {
    console.error("[stripe/checkout] failed", error);
    return NextResponse.json({ ok: false, message: "创建支付会话失败，请重试。" }, { status: 500 });
  }
}
