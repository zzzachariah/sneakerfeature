import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { revokeSubscription } from "@/lib/subscription/entitlements";

// Stripe refund + membership revocation. Two entry points:
//   * refundLatestPayment — admin-initiated: refund a member's most recent paid
//     Checkout Session and revoke their access.
//   * handleExternalRefund — webhook-initiated: a refund or chargeback that
//     originated on Stripe's side (Dashboard refund, dispute) already moved the
//     money; here we just reconcile our records and revoke access.
// Both revert the member to free; the tier-change lock then unlocks purchases.

export type RefundResult =
  | { status: "refunded"; refundId: string; amount: number | null; currency: string | null }
  | { status: "already_refunded" }
  | { status: "no_payment" }
  | { status: "error"; message: string };

type PaymentRow = {
  session_id: string;
  user_id: string;
  payment_intent_id: string | null;
  amount_total: number | null;
  currency: string | null;
  status: string;
};

// Stripe's allowed machine-readable refund reasons.
type StripeRefundReason = "requested_by_customer" | "duplicate" | "fraudulent";

async function latestPaidPayment(userId: string): Promise<PaymentRow | null> {
  const db = createAdminClient();
  if (!db) return null;
  const { data } = await db
    .from("stripe_payments")
    .select("session_id, user_id, payment_intent_id, amount_total, currency, status")
    .eq("user_id", userId)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PaymentRow | null) ?? null;
}

// Refund the user's most recent paid Stripe payment, then revoke membership.
// Idempotent: a user with no remaining paid payment returns "no_payment" (so the
// caller can offer a no-refund cancellation instead). Comped / manual grants
// carry no payment_intent and also return "no_payment".
export async function refundLatestPayment(
  userId: string,
  actorAdminId: string,
  reason: StripeRefundReason = "requested_by_customer"
): Promise<RefundResult> {
  const stripe = getStripe();
  const db = createAdminClient();
  if (!stripe || !db) return { status: "error", message: "Stripe or database not configured" };

  const payment = await latestPaidPayment(userId);
  if (!payment) return { status: "no_payment" };
  if (!payment.payment_intent_id) return { status: "no_payment" };

  let refundId: string;
  try {
    const refund = await stripe.refunds.create({
      payment_intent: payment.payment_intent_id,
      reason
    });
    refundId = refund.id;
  } catch (err) {
    const message =
      err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message ?? "")
        : "Refund failed";
    return { status: "error", message };
  }

  await db
    .from("stripe_payments")
    .update({
      status: "refunded",
      refund_id: refundId,
      refund_reason: reason,
      refunded_at: new Date().toISOString(),
      refunded_by: actorAdminId,
      updated_at: new Date().toISOString()
    })
    .eq("session_id", payment.session_id);

  await revokeSubscription(userId, {
    actorAdminId,
    reason: "refund",
    note: `refund ${refundId} for session ${payment.session_id}`
  });

  return {
    status: "refunded",
    refundId,
    amount: payment.amount_total,
    currency: payment.currency
  };
}

// Reconcile a refund / dispute that Stripe reports by webhook and revoke access.
// Matched to our record via payment_intent_id. Idempotent — a payment already
// marked refunded / disputed is a no-op so Stripe retries stay safe.
export async function handleExternalRefund(
  paymentIntentId: string,
  outcome: { status: "refunded" | "disputed"; refundId?: string | null }
): Promise<"handled" | "not_found" | "already" | "error"> {
  const db = createAdminClient();
  if (!db) return "error";

  const { data } = await db
    .from("stripe_payments")
    .select("session_id, user_id, status")
    .eq("payment_intent_id", paymentIntentId)
    .maybeSingle();
  const row = data as { session_id: string; user_id: string; status: string } | null;
  if (!row) return "not_found";
  if (row.status === "refunded" || row.status === "disputed") return "already";

  await db
    .from("stripe_payments")
    .update({
      status: outcome.status,
      refund_id: outcome.refundId ?? null,
      refunded_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq("session_id", row.session_id);

  await revokeSubscription(row.user_id, {
    actorAdminId: null,
    reason: outcome.status === "disputed" ? "dispute" : "refund",
    note: `stripe ${outcome.status} on ${paymentIntentId}`
  });

  return "handled";
}
