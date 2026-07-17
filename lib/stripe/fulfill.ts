import { getStripe } from "@/lib/stripe/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantFromPayment } from "@/lib/subscription/entitlements";
import type { Duration } from "@/lib/subscription/tiers";

export type FulfillResult =
  | { status: "granted"; tier: "pro" | "max"; duration: Duration }
  | { status: "already" }
  | { status: "unpaid" }
  | { status: "error"; message: string };

const PAID_TIERS = new Set(["pro", "max"]);
const DURATIONS = new Set(["monthly", "quarterly", "yearly", "permanent"]);

// Turn a PAID Checkout Session into a membership grant — idempotently. This is
// called from BOTH the Stripe webhook (server-to-server, reliable even if the
// buyer closes the tab) and the /subscribe/complete return page (covers the
// window before the webhook endpoint is configured). The stripe_payments row,
// keyed by session id, is the claim: whoever inserts it first performs the
// grant; every later caller is a no-op.
export async function fulfillCheckoutSession(sessionId: string): Promise<FulfillResult> {
  const stripe = getStripe();
  const db = createAdminClient();
  if (!stripe || !db) return { status: "error", message: "Stripe or database not configured" };

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== "paid") return { status: "unpaid" };

  const userId = session.metadata?.userId;
  const tier = session.metadata?.tier;
  const duration = session.metadata?.duration;
  if (!userId || !PAID_TIERS.has(tier ?? "") || !DURATIONS.has(duration ?? "")) {
    return { status: "error", message: "Session is missing valid membership metadata" };
  }

  // Claim the session (idempotency guard). A unique-violation means another
  // caller already fulfilled it.
  const { error: claimError } = await db.from("stripe_payments").insert({
    session_id: session.id,
    user_id: userId,
    tier,
    duration,
    amount_total: session.amount_total,
    currency: session.currency,
    status: "paid"
  });
  if (claimError) {
    if (claimError.code === "23505") return { status: "already" }; // unique_violation
    return { status: "error", message: claimError.message };
  }

  try {
    await grantFromPayment(userId, tier as "pro" | "max", duration as Duration, {
      sessionId: session.id,
      amountTotal: session.amount_total,
      currency: session.currency
    });
  } catch (err) {
    // Grant failed after claiming — release the claim so a retry (webhook or a
    // page refresh) can re-attempt cleanly.
    await db.from("stripe_payments").delete().eq("session_id", session.id);
    throw err;
  }

  return { status: "granted", tier: tier as "pro" | "max", duration: duration as Duration };
}
