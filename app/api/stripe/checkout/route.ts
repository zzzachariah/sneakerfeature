import { NextResponse } from "next/server";
import { z } from "zod";
import { getStripe } from "@/lib/stripe/server";
import { getCurrentProfile } from "@/lib/data/auth";
import { getMemberContext } from "@/lib/subscription/entitlements";
import { purchaseDecision } from "@/lib/subscription/resolve";
import { productFor } from "@/lib/subscription/stripe-prices";
import { tierConfig } from "@/lib/subscription/tiers";

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

  // Membership-change policy: an active paid member is locked to their current
  // tier until it expires — they may renew/extend the SAME tier but cannot
  // switch to the other one mid-term ("买任何一个，在截止日期前，不能更换"). A PERMANENT
  // member is refused every purchase, including a "renewal" of their own tier:
  // lifetime has no expiry to push out, and the grant would replace it with a
  // duration-based one — i.e. paying to be downgraded. This is the authoritative
  // guard; the subscribe UI mirrors it but must not be the only gate. Admins
  // bypass it so they can still test both checkouts end-to-end while
  // /subscribe is admin-only.
  if (profile.role !== "admin") {
    const member = await getMemberContext(profile.id);
    const decision = purchaseDecision(member.tier, tier, member.isPermanent);
    if (!decision.allowed) {
      const currentName = tierConfig(decision.currentTier).name;
      if (decision.reason === "permanent") {
        return NextResponse.json(
          {
            ok: false,
            code: "plan_permanent",
            message: `你已是 ${currentName} 永久会员，权益不会到期，无需也无法再次购买。`
          },
          { status: 409 }
        );
      }
      const until = member.expiresAt
        ? `（当前会员至 ${new Date(member.expiresAt).toLocaleDateString("zh-CN")} 到期）`
        : "";
      const message = `你当前已是 ${currentName} 会员，到期前不能更换其他档位，可续费延长同档。${until}`;
      return NextResponse.json({ ok: false, code: "plan_locked", message }, { status: 409 });
    }
  }

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
