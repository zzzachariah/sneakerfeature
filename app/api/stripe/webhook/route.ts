import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/server";
import { fulfillCheckoutSession } from "@/lib/stripe/fulfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Stripe webhook. Verifies the signature with STRIPE_WEBHOOK_SECRET, then
// fulfills paid checkout sessions. Returning non-2xx makes Stripe retry, so
// transient failures are safe. Idempotency lives in fulfillCheckoutSession.
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ ok: false, message: "Webhook not configured" }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, message: "Missing signature" }, { status: 400 });
  }

  const payload = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, signature, secret);
  } catch (err) {
    console.error("[stripe/webhook] signature verification failed", (err as Error).message);
    return NextResponse.json({ ok: false, message: "Invalid signature" }, { status: 400 });
  }

  try {
    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object as Stripe.Checkout.Session;
      const result = await fulfillCheckoutSession(session.id);
      console.log(`[stripe/webhook] ${event.type} ${session.id} -> ${result.status}`);
    }
  } catch (err) {
    console.error("[stripe/webhook] handler error", (err as Error).message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
