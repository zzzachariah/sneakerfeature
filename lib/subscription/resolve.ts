// Pure, client-safe subscription helpers (NO server imports). Shared by the
// server entitlement layer and by client components (auth state, badges) that
// need to resolve a member's effective tier / prefs without touching the DB.

import { isModelId, isPaidTier, tierConfig, tierSupportsModel, type ModelId, type Tier, type TierConfig } from "@/lib/subscription/tiers";
import { DEFAULT_SKIN, isSkinId, type SkinId } from "@/lib/subscription/skins";

export type MemberPrefs = {
  skin: SkinId;
  /** Ordered list of home section ids (empty = default order). */
  homeOrder: string[];
  /** Ordered/filtered list of nav item ids (empty = default menu). */
  menu: string[];
  /** Preferred model for AI: "base" or "premium" (legacy binary switch). */
  modelPref: "base" | "premium";
  /** Explicit Smart Picker model choice; null = tier default (modelPref legacy). */
  modelId: ModelId | null;
  /** Max-only "Signature" custom accent hex (e.g. "#e0559c"); null = use skin. */
  customAccent: string | null;
};

/** Validate + normalize a custom accent hex ("#rrggbb"); null if not a 6-digit hex. */
export function normalizeAccentHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(t);
  return m ? `#${m[1].toLowerCase()}` : null;
}

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
// paid tier resolves to `free` for entitlement purposes without mutating the DB.
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

// --- Membership-change policy ----------------------------------------------

export type PurchaseDecision =
  | { allowed: true; kind: "new" | "extend" }
  | { allowed: false; reason: "locked"; currentTier: "pro" | "max" };

/**
 * Decide whether a member may check out `targetTier` right now, per the
 * membership-change policy: once a paid plan is ACTIVE the member is locked to
 * that tier until it expires. Renewing/extending the SAME tier is fine, but
 * switching to the other tier (Pro <-> Max) is blocked mid-term
 * ("买任何一个，在截止日期前，不能更换"). Permanent plans never expire, so their tier
 * is effectively fixed until the member goes free.
 *
 * Pass the EFFECTIVE tier (post-expiry, from `resolveTier`) — an expired paid
 * plan counts as free and unlocks every purchase. This is the single source of
 * truth shared by the checkout API (authoritative) and the subscribe UI, so the
 * two can never drift. Admin test-checkout bypasses are the caller's job.
 */
export function purchaseDecision(effectiveTier: Tier, targetTier: "pro" | "max"): PurchaseDecision {
  if (!isPaidTier(effectiveTier)) return { allowed: true, kind: "new" };
  if (effectiveTier === targetTier) return { allowed: true, kind: "extend" };
  return { allowed: false, reason: "locked", currentTier: effectiveTier };
}

export function parseMemberPrefs(raw: unknown): MemberPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const skin = isSkinId(obj.skin) ? obj.skin : DEFAULT_SKIN;
  const homeOrder = Array.isArray(obj.homeOrder) ? obj.homeOrder.filter((x): x is string => typeof x === "string") : [];
  const menu = Array.isArray(obj.menu) ? obj.menu.filter((x): x is string => typeof x === "string") : [];
  const modelPref = obj.modelPref === "premium" ? "premium" : "base";
  const modelId = isModelId(obj.modelId) ? obj.modelId : null;
  const customAccent = normalizeAccentHex(obj.customAccent);
  return { skin, homeOrder, menu, modelPref, modelId, customAccent };
}

/**
 * The model a member's Smart Picker actually runs: their explicit pick when the
 * tier still supports it (a downgrade silently invalidates it), else the legacy
 * base/premium preference mapped onto the tier's models (Max defaults premium).
 */
export function resolveModelChoice(tier: Tier, prefs: MemberPrefs): ModelId {
  if (prefs.modelId && tierSupportsModel(tier, prefs.modelId)) return prefs.modelId;
  const cfg = tierConfig(tier);
  const premium = cfg.capabilities.premiumModel;
  if (premium && (tier === "max" || prefs.modelPref === "premium")) return premium;
  return cfg.baseModel;
}

// A stable, decorative 8-digit "member number" derived from the user id, shown
// on the membership card (e.g. "0042 1337"). Purely cosmetic — deterministic per
// user so it never changes, but carries no meaning and is safe to display.
export function memberSerial(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  const a = (h % 10000).toString().padStart(4, "0");
  const b = (Math.floor(h / 10000) % 10000).toString().padStart(4, "0");
  return `${a} ${b}`;
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
