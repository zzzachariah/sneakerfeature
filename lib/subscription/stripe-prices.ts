import type { Duration } from "@/lib/subscription/tiers";

export type PaidTier = "pro" | "max";

// Live-mode Stripe Product IDs — one product per tier x duration, as created in
// the Stripe Dashboard. We store the PRODUCT id (not the price id): the checkout
// route resolves each product's default price at request time, so re-pricing in
// the Dashboard never requires a code change here.
export const STRIPE_PRODUCTS: Record<PaidTier, Record<Duration, string>> = {
  pro: {
    monthly: "prod_Uu2PjLp4Z8Doo6",
    quarterly: "prod_Uu2QDDf9dfNNEE",
    yearly: "prod_Uu2Rezs96rMFRJ",
    permanent: "prod_Uu2ShVJPBPVnEy"
  },
  max: {
    monthly: "prod_Uu2nfXo6g0Rgx1",
    quarterly: "prod_Uu2nYfb3Gmmyrz",
    yearly: "prod_Uu2ooeoGVdwL55",
    permanent: "prod_Uu2oelQbpE7dLd"
  }
};

export function productFor(tier: PaidTier, duration: Duration): string {
  return STRIPE_PRODUCTS[tier][duration];
}
