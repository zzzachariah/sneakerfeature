// Server-side resolution of a member's effective entitlements: which tier is
// actually active (expiry-checked), the monthly premium allowance, and the
// admin grant flow. All writes go through the service-role client.

import { createAdminClient } from "@/lib/supabase/admin";
import { ALLOWANCE_PERIOD_SECONDS, DURATIONS, tierConfig, tierRank, type Duration, type Tier } from "@/lib/subscription/tiers";
import {
  memberContextFromRow,
  parseMemberPrefs,
  resolveTier,
  type MemberContext,
  type MemberPrefs,
  type SubscriptionRow
} from "@/lib/subscription/resolve";

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

// --- Bulk gift (全站送会员) --------------------------------------------------

export type BulkGiftPlan = {
  /** Profiles examined. */
  scanned: number;
  /** Members who get a brand-new term starting now. */
  granted: number;
  /** Active members of the gifted tier whose remaining time is extended. */
  extended: number;
  /** Skipped because their ACTIVE tier outranks the gift (never downgrade). */
  skippedHigherTier: number;
  /** Skipped because they already hold this tier permanently. */
  skippedPermanent: number;
  /** Expiry written to the fresh-term group; null when the gift is permanent. */
  expiresAt: string | null;
  permanent: boolean;
  /** False for a preview (nothing was written). */
  applied: boolean;
  /** First few affected members, for the preview UI. */
  sample: { username: string; tier: Tier; action: "grant" | "extend" }[];
};

type GiftRow = SubscriptionRow & { id: string; username: string | null };

const GIFT_PAGE = 1000; // profiles read per request
const GIFT_CHUNK = 500; // ids per bulk UPDATE
const GIFT_CONCURRENCY = 8; // parallel single-row extensions

/**
 * Gift `tier` for `duration` to EVERY member at once. Preview-first: pass
 * `apply: false` (the default) to get the plan without writing anything.
 *
 * The per-member policy mirrors setSubscription's stacking rule, so a gifted
 * membership is indistinguishable from a comped one:
 *   - an ACTIVE higher tier is skipped — a gift must never downgrade someone
 *     who paid for more (an EXPIRED one counts as free and does get the gift);
 *   - an ACTIVE same-tier member has the gift STACKED onto their remaining time;
 *   - a PERMANENT same-tier member is skipped (nothing to add);
 *   - everyone else starts a fresh term from now.
 *
 * Not idempotent: running it twice stacks two terms onto everyone. Preview first.
 *
 * The monthly allowance is deliberately NOT seeded per member — refresh_allowance
 * upserts the row on first read/spend, so gifted members get their credits the
 * moment they use the AI, without this writing a row per user.
 */
export async function giftAllMembers(
  tier: "pro" | "max",
  duration: Duration,
  opts: { apply?: boolean; actorAdminId: string | null; limit?: number | null } = { actorAdminId: null }
): Promise<BulkGiftPlan> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");
  const apply = opts.apply === true;
  const limit = opts.limit && opts.limit > 0 ? opts.limit : null;

  // --- read every profile ---
  const rows: GiftRow[] = [];
  for (let from = 0; ; from += GIFT_PAGE) {
    const { data, error } = await db
      .from("profiles")
      .select("id, username, subscription_tier, subscription_expires_at, subscription_is_permanent")
      .order("id", { ascending: true })
      .range(from, from + GIFT_PAGE - 1);
    if (error) throw new Error(`Failed to read profiles: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as GiftRow[]));
    if (data.length < GIFT_PAGE) break;
    if (limit && rows.length >= limit) break;
  }
  const profiles = limit ? rows.slice(0, limit) : rows;

  // --- plan ---
  const now = new Date();
  const fresh: GiftRow[] = [];
  const extend: { row: GiftRow; expiresAt: string | null }[] = [];
  let skippedHigherTier = 0;
  let skippedPermanent = 0;

  for (const row of profiles) {
    const { tier: effective } = resolveTier(row);
    if (tierRank(effective) > tierRank(tier)) {
      skippedHigherTier += 1;
    } else if (effective === tier && row.subscription_is_permanent) {
      skippedPermanent += 1;
    } else if (effective === tier && row.subscription_expires_at) {
      // Active same tier — stack onto whatever time is left.
      const { expiresAt } = computeExpiry(duration, new Date(row.subscription_expires_at));
      extend.push({ row, expiresAt });
    } else {
      fresh.push(row);
    }
  }

  const { expiresAt: freshExpiry, permanent } = computeExpiry(duration, now);
  const sample: BulkGiftPlan["sample"] = [
    ...fresh.slice(0, 5).map((r) => ({ username: r.username ?? r.id, tier, action: "grant" as const })),
    ...extend.slice(0, 5).map((e) => ({ username: e.row.username ?? e.row.id, tier, action: "extend" as const }))
  ];

  const plan: BulkGiftPlan = {
    scanned: profiles.length,
    granted: fresh.length,
    extended: extend.length,
    skippedHigherTier,
    skippedPermanent,
    expiresAt: freshExpiry,
    permanent,
    applied: false,
    sample
  };
  if (!apply) return plan;

  // --- write ---
  const stamp = now.toISOString();
  // Fresh terms all share one expiry, so they go out as chunked bulk UPDATEs.
  for (let i = 0; i < fresh.length; i += GIFT_CHUNK) {
    const ids = fresh.slice(i, i + GIFT_CHUNK).map((r) => r.id);
    const { error } = await db
      .from("profiles")
      .update({
        subscription_tier: tier,
        subscription_started_at: stamp,
        subscription_expires_at: freshExpiry,
        subscription_is_permanent: permanent,
        updated_at: stamp
      })
      .in("id", ids);
    if (error) throw new Error(`Bulk gift failed at offset ${i}: ${error.message}`);
  }

  // Extensions each land on their own expiry → one UPDATE per member.
  for (let i = 0; i < extend.length; i += GIFT_CONCURRENCY) {
    const batch = extend.slice(i, i + GIFT_CONCURRENCY);
    const results = await Promise.all(
      batch.map(({ row, expiresAt }) =>
        db
          .from("profiles")
          .update({
            subscription_tier: tier,
            subscription_expires_at: expiresAt,
            subscription_is_permanent: permanent,
            updated_at: stamp
          })
          .eq("id", row.id)
      )
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(`Gift extension failed: ${failed.error.message}`);
  }

  // Best-effort audit trail: ONE summary row, not one per member.
  const { error: auditError } = await db.from("admin_audit_logs").insert({
    actor_admin_id: opts.actorAdminId,
    target_type: "profile",
    action: `subscription:gift-all->${tier}`,
    note: `Bulk gift: ${tier} (${duration}) to ${fresh.length + extend.length} member(s)`,
    before_payload: { scanned: profiles.length, skippedHigherTier, skippedPermanent },
    after_payload: {
      tier,
      duration,
      expiresAt: freshExpiry,
      permanent,
      granted: fresh.length,
      extended: extend.length
    }
  });
  if (auditError) console.warn("[entitlements] gift audit skipped:", auditError.message);

  return { ...plan, applied: true };
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
