// Server-side resolution of a member's effective entitlements: which tier is
// actually active (expiry-checked), the monthly premium allowance, and the
// admin grant flow. All writes go through the service-role client.

import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALLOWANCE_PERIOD_SECONDS,
  DURATIONS,
  isPaidTier,
  tierConfig,
  type Duration,
  type Tier,
  type TierConfig
} from "@/lib/subscription/tiers";
import { DEFAULT_SKIN, isSkinId, type SkinId } from "@/lib/subscription/skins";

export type MemberPrefs = {
  skin: SkinId;
  /** Ordered list of home section ids (empty = default order). */
  homeOrder: string[];
  /** Ordered/filtered list of nav item ids (empty = default menu). */
  menu: string[];
  /** Preferred model for AI: "base" or "premium". */
  modelPref: "base" | "premium";
};

export type SubscriptionRow = {
  subscription_tier?: string | null;
  subscription_expires_at?: string | null;
  subscription_is_permanent?: boolean | null;
  member_prefs?: unknown;
};

export type MemberContext = {
  tier: Tier;
  config: TierConfig;
  isPermanent: boolean;
  expiresAt: string | null;
  /** True when a paid tier is set but its expiry has passed. */
  expired: boolean;
  prefs: MemberPrefs;
};

// The paid tier is only in effect while unexpired (or permanent). An expired
// paid tier resolves to `free` for entitlement purposes without mutating the DB
// (a lazy downgrade; a cleanup job or the next admin action can persist it).
export function resolveTier(row: SubscriptionRow): { tier: Tier; expired: boolean } {
  const stored = row.subscription_tier;
  const tier: Tier = stored === "pro" || stored === "max" ? stored : "free";
  if (!isPaidTier(tier)) return { tier: "free", expired: false };
  if (row.subscription_is_permanent) return { tier, expired: false };
  const expiresAt = row.subscription_expires_at ? new Date(row.subscription_expires_at).getTime() : null;
  if (expiresAt == null || Number.isNaN(expiresAt)) return { tier: "free", expired: true };
  if (expiresAt <= Date.now()) return { tier: "free", expired: true };
  return { tier, expired: false };
}

export function parseMemberPrefs(raw: unknown): MemberPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const skin = isSkinId(obj.skin) ? obj.skin : DEFAULT_SKIN;
  const homeOrder = Array.isArray(obj.homeOrder) ? obj.homeOrder.filter((x): x is string => typeof x === "string") : [];
  const menu = Array.isArray(obj.menu) ? obj.menu.filter((x): x is string => typeof x === "string") : [];
  const modelPref = obj.modelPref === "premium" ? "premium" : "base";
  return { skin, homeOrder, menu, modelPref };
}

export function memberContextFromRow(row: SubscriptionRow): MemberContext {
  const { tier, expired } = resolveTier(row);
  return {
    tier,
    config: tierConfig(tier),
    isPermanent: Boolean(row.subscription_is_permanent) && isPaidTier(tier),
    expiresAt: row.subscription_expires_at ?? null,
    expired,
    prefs: parseMemberPrefs(row.member_prefs)
  };
}

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
