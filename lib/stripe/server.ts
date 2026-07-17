import Stripe from "stripe";

// Server-only Stripe client. Returns null when STRIPE_SECRET_KEY is unset so
// callers can degrade gracefully (the subscribe UI shows "payment unavailable")
// instead of the whole route crashing at import time. The key is a SECRET — it
// lives only in the server environment, never in the client bundle.
let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!cached) {
    // apiVersion is intentionally omitted: the SDK pins its own known-good
    // version, which avoids drift between the string here and the types.
    cached = new Stripe(key);
  }
  return cached;
}
