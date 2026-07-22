// Server-side resolution of a member's effective entitlements: which tier is
// actually active (expiry-checked), the monthly premium allowance, and the
// admin grant flow. All writes go through the service-role client.

import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWANCE_PERIOD_SECONDS, DURATIONS, tierConfig, type Duration, type Tier } from "@/lib/subscription/tiers";
import { memberContextFromRow, parseMemberPrefs, type MemberContext, type MemberPrefs } from "@/lib/subscription/resolve";

export type { MemberPrefs, MemberContext, SubscriptionRow } from "@/lib/subscription/resolve";
export { resolveTier, parseMemberPrefs, memberContextFromRow } from "@/lib/subscription/resolve";

// Server read of a user's membership context straight from profiles.
export async function getMemberContext(userId: string): Promise<MemberContext> {
  const db = createAdminClient();
  if (!db) return memberContextFromRow({});
  const { data } = await db
    .from("profiles")
    .select("subscription_tier, subscription_expires_at, subscription_is_permanent, member_prefs")
    .eq("id", userId)
    .maybeSingle();
  return memberContextFromRow(data ?? {});
}

// --- Monthly premium allowance ---------------------------------------------

export async function getAllowanceBalance(userId: string, tier: Tier): Promise<number> {
  const db = createAdminClient();
  if (!db) return 0;
  const grant = tierConfig(tier).capabilities.monthlyAllowance;
  const { data, error } = await db.rpc("refresh_allowance", {
    p_user_id: userId,
    p_monthly_grant: grant,
    p_period_seconds: ALLOWANCE_PERIOD_SECONDS
  });
  if (error) {
    console.error("[entitlements] refresh_allowance failed", error.message);
    return 0;
  }
  return (data as number) ?? 0;
}

export class InsufficientAllowanceError extends Error {
  constructor() {
    super("Insufficient premium allowance");
    this.name = "InsufficientAllowanceError";
  }
}

export async function spendAllowance(userId: string, amount: number, tier: Tier): Promise<number> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");
  const grant = tierConfig(tier).capabilities.monthlyAllowance;
  const { data, error } = await db.rpc("spend_allowance", {
    p_user_id: userId,
    p_amount: amount,
    p_monthly_grant: grant,
    p_period_seconds: ALLOWANCE_PERIOD_SECONDS
  });
  if (error) {
    if (error.message?.includes("insufficient_allowance") || error.code === "23514") {
      throw new InsufficientAllowanceError();
    }
    throw error;
  }
  return (data as number) ?? 0;
}

// --- Admin grant flow -------------------------------------------------------

export function computeExpiry(duration: Duration, from = new Date()): { expiresAt: string | null; permanent: boolean } {
  if (duration === "permanent") return { expiresAt: null, permanent: true };
  const days = DURATIONS.find((d) => d.id === duration)?.days ?? 30;
  const end = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
  return { expiresAt: end.toISOString(), permanent: false };
}

export type GrantResult = {
  tier: Tier;
  expiresAt: string | null;
  permanent: boolean;
};

// Admin manually grants/extends a membership. If the user already has the same
// paid tier and isn't permanent, the new duration STACKS onto the remaining
// time; switching tiers or granting permanent resets from now.
export async function setSubscription(
  userId: string,
  tier: Tier,
  duration: Duration,
  actorAdminId: string
): Promise<GrantResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");

  const { data: current } = await db
    .from("profiles")
    .select("subscription_tier, subscription_expires_at, subscription_is_permanent, username")
    .eq("id", userId)
    .maybeSingle();

  let result: GrantResult;
  if (tier === "free") {
    result = { tier: "free", expiresAt: null, permanent: false };
    await db
      .from("profiles")
      .update({
        subscription_tier: "free",
        subscription_expires_at: null,
        subscription_is_permanent: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);
  } else {
    // Stack onto remaining time only when extending the SAME non-permanent tier.
    const sameTier = current?.subscription_tier === tier;
    const notPermanent = !current?.subscription_is_permanent;
    const remaining =
      sameTier && notPermanent && current?.subscription_expires_at
        ? new Date(current.subscription_expires_at)
        : new Date();
    const base = remaining.getTime() > Date.now() ? remaining : new Date();
    const { expiresAt, permanent } = computeExpiry(duration, base);
    result = { tier, expiresAt, permanent };
    await db
      .from("profiles")
      .update({
        subscription_tier: tier,
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: expiresAt,
        subscription_is_permanent: permanent,
        updated_at: new Date().toISOString()
      })
      .eq("id", userId);

    // Seed / refresh the allowance row so premium usage works immediately.
    await getAllowanceBalance(userId, tier);
  }

  // Best-effort audit trail (tolerant of pre-migration audit schema).
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: actorAdminId,
    target_type: "profile",
    action: `subscription:${current?.subscription_tier ?? "free"}->${tier}`,
    note: `@${current?.username ?? userId}: ${tier} (${duration})`,
    before_payload: { tier: current?.subscription_tier ?? "free" },
    after_payload: { tier, duration, expiresAt: result.expiresAt, permanent: result.permanent }
  });
  if (auditError) console.warn("[entitlements] audit log skipped:", auditError.message);

  return result;
}

// --- Cancellation / revocation ---------------------------------------------

export type RevokeReason = "cancel" | "refund" | "dispute";

// Revoke a member's paid access, resetting them to the free tier. Backs both
// admin cancellations and refunds (the latter after the Stripe refund settles).
// Safe to call when already free — it just re-asserts the free state. Once free,
// the tier-change lock (purchaseDecision) releases so the member can buy again.
// actorAdminId is null for webhook-driven reverts (Stripe Dashboard refund /
// chargeback), mirroring grantFromPayment's payment-actor audit rows.
export async function revokeSubscription(
  userId: string,
  opts: { actorAdminId: string | null; reason: RevokeReason; note?: string }
): Promise<GrantResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");

  const { data: current } = await db
    .from("profiles")
    .select("subscription_tier, subscription_expires_at, subscription_is_permanent, username")
    .eq("id", userId)
    .maybeSingle();

  await db
    .from("profiles")
    .update({
      subscription_tier: "free",
      subscription_expires_at: null,
      subscription_is_permanent: false,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: opts.actorAdminId,
    target_type: "profile",
    action: `subscription:${opts.reason}:${current?.subscription_tier ?? "free"}->free`,
    note: opts.note ?? `@${current?.username ?? userId}: ${opts.reason} → free`,
    before_payload: {
      tier: current?.subscription_tier ?? "free",
      expiresAt: current?.subscription_expires_at ?? null,
      permanent: Boolean(current?.subscription_is_permanent)
    },
    after_payload: { tier: "free", reason: opts.reason }
  });
  if (auditError) console.warn("[entitlements] revoke audit skipped:", auditError.message);

  return { tier: "free", expiresAt: null, permanent: false };
}

// Persist member UI prefs (skin / home order / menu / model pref). Only paid
// tiers may personalize; callers should gate on that first.
export async function saveMemberPrefs(userId: string, patch: Partial<MemberPrefs>): Promise<MemberPrefs> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");
  const { data } = await db.from("profiles").select("member_prefs").eq("id", userId).maybeSingle();
  const current = parseMemberPrefs(data?.member_prefs);
  const next: MemberPrefs = { ...current, ...patch };
  await db
    .from("profiles")
    .update({ member_prefs: next, updated_at: new Date().toISOString() })
    .eq("id", userId);
  return next;
}

// --- Paid-checkout grant (Stripe) ------------------------------------------

// Grant a membership from a completed Stripe payment. Mirrors the admin grant's
// stacking rule (extend the SAME non-permanent tier from its remaining time;
// switching tier or going permanent resets from now) but records the action as
// a payment rather than an admin edit. Idempotency is enforced by the caller
// (lib/stripe/fulfill.ts) via the stripe_payments session claim, so this must
// only ever run once per checkout session.
export async function grantFromPayment(
  userId: string,
  tier: "pro" | "max",
  duration: Duration,
  payment: { sessionId: string; amountTotal: number | null; currency: string | null }
): Promise<GrantResult> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");

  const { data: current } = await db
    .from("profiles")
    .select("subscription_tier, subscription_expires_at, subscription_is_permanent, username")
    .eq("id", userId)
    .maybeSingle();

  const sameTier = current?.subscription_tier === tier;
  const notPermanent = !current?.subscription_is_permanent;
  const remaining =
    sameTier && notPermanent && current?.subscription_expires_at
      ? new Date(current.subscription_expires_at)
      : new Date();
  const base = remaining.getTime() > Date.now() ? remaining : new Date();
  const { expiresAt, permanent } = computeExpiry(duration, base);

  await db
    .from("profiles")
    .update({
      subscription_tier: tier,
      subscription_started_at: new Date().toISOString(),
      subscription_expires_at: expiresAt,
      subscription_is_permanent: permanent,
      updated_at: new Date().toISOString()
    })
    .eq("id", userId);

  // Seed / refresh the allowance row so premium usage works immediately.
  await getAllowanceBalance(userId, tier);

  // Best-effort audit trail — actor is the payment, not an admin.
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: null,
    target_type: "profile",
    action: `subscription:stripe:${current?.subscription_tier ?? "free"}->${tier}`,
    note: `@${current?.username ?? userId}: ${tier} (${duration}) via Stripe ${payment.sessionId}`,
    before_payload: { tier: current?.subscription_tier ?? "free" },
    after_payload: {
      tier,
      duration,
      expiresAt,
      permanent,
      session: payment.sessionId,
      amount: payment.amountTotal,
      currency: payment.currency
    }
  });
  if (auditError) console.warn("[entitlements] payment audit skipped:", auditError.message);

  return { tier, expiresAt, permanent };
}
