// Single source of truth for the premium membership system.
//
// SAFE FOR CLIENT + SERVER: this module holds no secrets and touches no
// process.env — the subscribe page, theming, badges and the server all import
// the same config so pricing/quotas/capabilities can never drift apart. The
// actual API keys per model live server-side in lib/ai/packy-client.ts; here we
// only name the model IDs.

export type Tier = "free" | "pro" | "max";
export type Duration = "monthly" | "quarterly" | "yearly" | "permanent";

// Cookie the client writes (MemberThemeApplier) so the SERVER can render a paid
// member's tier on first paint — used by app/layout.tsx to stamp
// `data-member-tier` on <html>. That attribute drives BOTH the tier-aware
// Premium UI accent (the Max half of a skin, via CSS) and the per-tier
// structural variant (via PremiumTierProvider). Mirrors the `sf-premium-ui` skin
// cookie: only set for paid tiers, absent means free. Client + server safe.
export const MEMBER_TIER_COOKIE = "sf-member-tier";

// Model IDs as configured on the packyapi relay. Each paid model uses its own
// key env var (see packy-client.ts); the ID strings live here so UI and server
// agree on what each tier runs.
export const MODEL_IDS = {
  haiku: "claude-haiku-4-5-20251001",
  deepseek: "deepseek-v4-pro",
  opus: "claude-opus-5"
} as const;
export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

// --- Smart Picker model catalog ---------------------------------------------
// Every model the Smart Picker offers, in display order. The picker shows the
// FULL list to every tier and grays out what the member's plan can't run, so
// upgrades stay discoverable in place (same idea as the tier-locked skins).
export type PickerModelInfo = {
  id: ModelId;
  /** Short display name shown on the picker chip and rows. */
  name: string;
  /** One-line description of the trade-off this model represents. */
  tagline: string;
  taglineZh: string;
  /** SF Symbol for the native iOS picker rows. */
  symbol: string;
  /** Lowest tier whose plan may run this model. */
  minTier: Tier;
  /** Metered from the monthly premium allowance (vs unlimited / credits). */
  premium: boolean;
};

export const PICKER_MODELS: PickerModelInfo[] = [
  {
    id: MODEL_IDS.haiku,
    name: "Haiku",
    tagline: "Light and fast for everyday picks",
    taglineZh: "轻量快速，日常选鞋够用",
    symbol: "hare.fill",
    minTier: "free",
    premium: false
  },
  {
    id: MODEL_IDS.deepseek,
    name: "DeepSeek V4",
    tagline: "Balanced workhorse, unlimited on paid plans",
    taglineZh: "均衡主力，会员不限次数",
    symbol: "bolt.fill",
    minTier: "pro",
    premium: false
  },
  {
    id: MODEL_IDS.opus,
    name: "Opus 5",
    tagline: "The flagship — deepest reasoning, uses the monthly allowance",
    taglineZh: "顶级旗舰，思考最深，使用月度额度",
    symbol: "crown.fill",
    minTier: "pro",
    premium: true
  }
];

const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, max: 2 };

/** Ordering of the tier ladder (free < pro < max) for "is this an upgrade?" checks. */
export function tierRank(tier: Tier): number {
  return TIER_RANK[tier] ?? 0;
}

export function isModelId(v: unknown): v is ModelId {
  return typeof v === "string" && Object.values(MODEL_IDS).includes(v as ModelId);
}

export function pickerModelInfo(id: string): PickerModelInfo | null {
  return PICKER_MODELS.find((m) => m.id === id) ?? null;
}

/** Whether `tier`'s plan may run `modelId`. Admin overrides are the caller's job. */
export function tierSupportsModel(tier: Tier, modelId: string): boolean {
  const info = pickerModelInfo(modelId);
  return info != null && TIER_RANK[tier] >= TIER_RANK[info.minTier];
}

/**
 * Whether running `modelId` draws from `tier`'s monthly allowance. Reads the
 * catalog's `premium` flag rather than comparing against the tier's headline
 * `premiumModel`, so ANY premium model a tier can pick is metered — not just
 * the one it advertises. Both paid tiers currently headline the same model, but
 * the flag is what keeps a second premium model from billing as a free base turn.
 */
export function isAllowanceMetered(tier: Tier, modelId: string): boolean {
  const info = pickerModelInfo(modelId);
  if (!info?.premium) return false;
  return tierConfig(tier).capabilities.monthlyAllowance > 0;
}

// How deep the AI prompt/pipeline runs. Strategy A (depth ladder): one core
// expert prompt, scaled per tier by these knobs, with Max layering a concierge
// voice on top.
export type PromptDepth = "concise" | "standard" | "deep";

export type TierCapabilities = {
  /** Base model runs unlimited (no per-query charge). False = metered by ai_credits. */
  baseUnlimited: boolean;
  /**
   * The tier's headline premium model — what it defaults to and advertises.
   * Both paid tiers run Opus 5, the flagship; they differ in how much of it the
   * plan buys (`monthlyAllowance`, Max = 5× Pro) and how deep the pipeline runs
   * (`prompt`), not in which model they may pick. Metered from the monthly
   * allowance, as is any other `premium` model the tier can pick
   * (see isAllowanceMetered).
   */
  premiumModel: ModelId | null;
  /**
   * Credits granted to the premium allowance each period. Sized against what the
   * premium model actually costs us: a Smart Picker turn charges `prompt.count`
   * (Pro 5 / Max 8) and an advisor reply charges 1, so Pro ≈ 24 and Max ≈ 75
   * flagship turns per cycle. Max stays 5× Pro — the subscribe page says so, and
   * with both tiers on the same model this IS the difference between them.
   */
  monthlyAllowance: number;
  /** Precise per-shoe sizing advisor (foot-scan personalized). Premium only. */
  preciseSizing: boolean;
  /** Home-order + menu customization + skin selection. */
  personalization: boolean;
  /** Higher queue priority for AI requests. */
  priority: boolean;
  /** Early access to new features. */
  earlyAccess: boolean;
};

export type TierPrompt = {
  /** Max recommendations returned per query. */
  count: number;
  /** Max web_search calls the pipeline may spend. */
  searchBudget: number;
  depth: PromptDepth;
  /** Assistant persona/voice appended to the system prompt. */
  concierge: boolean;
  followUp: boolean;
};

export type TierConfig = {
  id: Tier;
  /** English + Chinese display names. */
  name: string;
  nameZh: string;
  tagline: string;
  /** Base model used by default for this tier. */
  baseModel: ModelId;
  capabilities: TierCapabilities;
  prompt: TierPrompt;
  /** Canonical badge accent (Pro = blue, Max = gold), independent of the chosen skin. */
  badgeHue: string;
  badgeGlyph: string;
};

// Length of one allowance cycle, in seconds. Rolling 30 days (not calendar) so a
// permanent member's monthly grant refreshes predictably regardless of purchase date.
export const ALLOWANCE_PERIOD_SECONDS = 30 * 24 * 60 * 60;

export const TIERS: Record<Tier, TierConfig> = {
  free: {
    id: "free",
    name: "Free",
    nameZh: "免费",
    tagline: "先逛起来",
    baseModel: MODEL_IDS.haiku,
    capabilities: {
      baseUnlimited: false, // metered by daily check-in credits, as today
      premiumModel: null,
      monthlyAllowance: 0,
      preciseSizing: false,
      personalization: false,
      priority: false,
      earlyAccess: false
    },
    prompt: { count: 3, searchBudget: 1, depth: "concise", concierge: false, followUp: false },
    badgeHue: "#7c828e",
    badgeGlyph: "○"
  },
  pro: {
    id: "pro",
    name: "Pro",
    nameZh: "Pro",
    tagline: "给认真选鞋的人",
    baseModel: MODEL_IDS.deepseek,
    capabilities: {
      baseUnlimited: true,
      premiumModel: MODEL_IDS.opus,
      monthlyAllowance: 120,
      preciseSizing: true,
      personalization: true,
      priority: false,
      earlyAccess: false
    },
    prompt: { count: 5, searchBudget: 3, depth: "standard", concierge: false, followUp: true },
    badgeHue: "#4c86e0",
    badgeGlyph: "◆"
  },
  max: {
    id: "max",
    name: "Max",
    nameZh: "Max",
    tagline: "给发烧友与收藏家",
    baseModel: MODEL_IDS.deepseek,
    capabilities: {
      baseUnlimited: true,
      premiumModel: MODEL_IDS.opus,
      monthlyAllowance: 600,
      preciseSizing: true,
      personalization: true,
      priority: true,
      earlyAccess: true
    },
    prompt: { count: 8, searchBudget: 5, depth: "deep", concierge: true, followUp: true },
    badgeHue: "#d9b45a",
    badgeGlyph: "❖"
  }
};

// --- Durations & pricing (HK$) ---------------------------------------------
// Display currency for all prices. Charged in HKD via Stripe.
export const CURRENCY = "HK$";

export type DurationConfig = {
  id: Duration;
  label: string;
  /** Length in days; null = permanent. */
  days: number | null;
};

export const DURATIONS: DurationConfig[] = [
  { id: "monthly", label: "1 个月", days: 30 },
  { id: "quarterly", label: "3 个月", days: 90 },
  { id: "yearly", label: "1 年", days: 365 },
  { id: "permanent", label: "永久", days: null }
];

// Price matrix (HK$). One-time "time pass" prices — the app fulfils the
// duration via subscription_expires_at; Stripe is not billing recurring.
export const PRICING: Record<Exclude<Tier, "free">, Record<Duration, number>> = {
  pro: { monthly: 18, quarterly: 48, yearly: 148, permanent: 398 },
  max: { monthly: 45, quarterly: 118, yearly: 368, permanent: 998 }
};

export function isPaidTier(tier: Tier): tier is "pro" | "max" {
  return tier === "pro" || tier === "max";
}

/**
 * Whether this tier's base model runs without spending ai_credits — i.e. the
 * member can always send, whatever their credit balance says. True for every
 * paid tier; the premium model is metered separately by the monthly allowance
 * and gracefully falls back to the base model when that runs out, so it never
 * blocks either. Callers use this to decide whether to gate the composer or
 * show "∞" instead of a credit balance.
 */
export function hasUnmeteredBase(tier: Tier): boolean {
  return tierConfig(tier).capabilities.baseUnlimited;
}

export function tierConfig(tier: Tier): TierConfig {
  return TIERS[tier] ?? TIERS.free;
}

export function priceFor(tier: Tier, duration: Duration): number | null {
  if (!isPaidTier(tier)) return null;
  return PRICING[tier][duration];
}

/** Effective monthly price for display ("≈ HK$X / 月"); permanent has none. */
export function monthlyEquivalent(tier: Tier, duration: Duration): number | null {
  const price = priceFor(tier, duration);
  const dur = DURATIONS.find((d) => d.id === duration);
  if (price == null || !dur?.days) return null;
  return Math.round((price / dur.days) * 30 * 10) / 10;
}
