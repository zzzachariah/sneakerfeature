// Single source of truth for the premium membership system.
//
// SAFE FOR CLIENT + SERVER: this module holds no secrets and touches no
// process.env — the subscribe page, theming, badges and the server all import
// the same config so pricing/quotas/capabilities can never drift apart. The
// actual API keys per model live server-side in lib/ai/packy-client.ts; here we
// only name the model IDs.

export type Tier = "free" | "pro" | "max";
export type Duration = "monthly" | "quarterly" | "yearly" | "permanent";

// Model IDs as configured on the packyapi relay. Each paid model uses its own
// key env var (see packy-client.ts); the ID strings live here so UI and server
// agree on what each tier runs.
export const MODEL_IDS = {
  haiku: "claude-haiku-4-5-20251001",
  deepseek: "deepseek-v4-pro",
  fable: "claude-fable-5"
} as const;
export type ModelId = (typeof MODEL_IDS)[keyof typeof MODEL_IDS];

// How deep the AI prompt/pipeline runs. Strategy A (depth ladder): one core
// expert prompt, scaled per tier by these knobs, with Max layering a concierge
// voice on top.
export type PromptDepth = "concise" | "standard" | "deep";

export type TierCapabilities = {
  /** Base model runs unlimited (no per-query charge). False = metered by ai_credits. */
  baseUnlimited: boolean;
  /** Premium model (Fable) unlocked, metered from the monthly allowance. */
  premiumModel: ModelId | null;
  /** Credits granted to the premium allowance each period. */
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
      premiumModel: MODEL_IDS.fable,
      monthlyAllowance: 300,
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
      premiumModel: MODEL_IDS.fable,
      monthlyAllowance: 1500,
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
