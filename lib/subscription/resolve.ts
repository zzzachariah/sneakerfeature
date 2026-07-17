// Pure, client-safe subscription helpers (NO server imports). Shared by the
// server entitlement layer and by client components (auth state, badges) that
// need to resolve a member's effective tier / prefs without touching the DB.

import { isPaidTier, tierConfig, type Tier, type TierConfig } from "@/lib/subscription/tiers";
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

export function parseMemberPrefs(raw: unknown): MemberPrefs {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const skin = isSkinId(obj.skin) ? obj.skin : DEFAULT_SKIN;
  const homeOrder = Array.isArray(obj.homeOrder) ? obj.homeOrder.filter((x): x is string => typeof x === "string") : [];
  const menu = Array.isArray(obj.menu) ? obj.menu.filter((x): x is string => typeof x === "string") : [];
  const modelPref = obj.modelPref === "premium" ? "premium" : "base";
  return { skin, homeOrder, menu, modelPref };
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
