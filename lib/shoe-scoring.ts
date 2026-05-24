const DASH_VARIANTS_REGEX = /[‐‑‒–—―−]/g;
const SPACE_REGEX = /\s+/g;
const QUOTE_REGEX = /[“”"']/g;

const STABILITY_DEFAULT = 70;
const TRACTION_DEFAULT = 72;
const FIT_DEFAULT = 78;
const CUSHIONING_FEEL_DEFAULT = 74;
const COURT_FEEL_DEFAULT = 72;
const BOUNCE_DEFAULT = 72;

// ============================================================
//  Dimension dictionaries
// ============================================================

export const STABILITY_EXACT: Record<string, number> = {
  "very poor": 12,
  "poor": 20,
  "below expectation": 32,
  "below average": 35,
  "low": 40,
  "low-moderate": 48,
  "limited": 50,
  "limited-moderate": 54,
  "moderate": 58,
  "average": 60,
  "decent": 64,
  "moderate to good": 66,
  "moderate-good": 68,
  "good": 74,
  "solid": 77,
  "solid platform": 79,
  "good to very good": 81,
  "strong": 84,
  "very good": 88,
  "very strong": 90,
  "high": 92,
  "very high": 96,
  "excellent": 98,
  "elite": 100,
  "top-tier": 100,
  "top tier": 100,
  "stable": 80,
  "supportive platform": 82,
  "supportive": 84,
  "highly stable": 94,
  "elite stability": 100
};

export const STABILITY_BASE: Record<string, number> = {
  "very poor": 12,
  "poor": 20,
  "below expectation": 32,
  "below average": 35,
  "low": 40,
  "low-moderate": 48,
  "limited": 50,
  "limited-moderate": 54,
  "moderate": 58,
  "average": 60,
  "decent": 64,
  "moderate to good": 66,
  "moderate-good": 68,
  "good": 74,
  "solid": 77,
  "solid platform": 79,
  "good to very good": 81,
  "strong": 84,
  "very good": 88,
  "very strong": 90,
  "high": 92,
  "very high": 96,
  "excellent": 98,
  "elite": 100,
  "top-tier": 100,
  "top tier": 100,
  "stable": 80,
  "supportive platform": 82,
  "supportive": 84
};

export const STABILITY_MODIFIERS: Record<string, number> = {
  "very": 4,
  "highly": 5,
  "extremely": 6,
  "incredibly": 5,
  "wide base": 4,
  "wide-base": 4,
  "narrow base": -4,
  "narrow-base": -4,
  "wobbly": -10,
  "tippy": -8,
  "rollover": -6,
  "rolls": -4,
  "high-cut": 3,
  "low-cut": -3,
  "lacking": -10,
  "lacks": -10,
  "less stable": -8,
  "needs work": -6,
  "concerning": -8,
  "iffy": -6
};

export const TRACTION_BASE: Record<string, number> = {
  "very poor": 12,
  "poor": 20,
  "below average": 35,
  mixed: 42,
  polarizing: 48,
  "mixed to good": 56,
  decent: 64,
  good: 72,
  "good overall": 73,
  "generally good": 73,
  solid: 78,
  "good to very good": 80,
  "strong overall": 86,
  "very good": 88,
  great: 92,
  excellent: 97,
  "excellent overall": 97,
  elite: 100,
  "top-tier": 100,
  "top tier": 100
};

export const TRACTION_MODIFIERS: Record<string, number> = {
  "clean court": 4,
  "clean courts": 4,
  "clean floor": 4,
  "clean floors": 4,
  indoors: 2,
  indoor: 2,
  outdoors: 1,
  outdoor: 1,
  "for the price": 2,
  "flow version": 2,
  "need wiping": -4,
  dust: -6,
  dusty: -6,
  "weaker on dust": -8,
  "less forgiving in dust": -7,
  "less loved outdoors": -4,
  "clean-court dependent": -6,
  "pattern-dependent": -5,
  "depending on rubber": -4,
  "durability mixed": -5,
  "mixed before": -3
};

export const TRACTION_EXACT: Record<string, number> = {
  "excellent on clean courts": 99,
  "excellent on clean floors": 99,
  "excellent for the price": 98,
  "excellent overall": 97,
  "very good; dust can still matter": 83,
  "great on clean courts, weaker on dust": 84,
  "great on clean courts; less forgiving in dust": 85,
  "good but can need wiping": 68,
  "good on clean courts, durability mixed": 66,
  "generally good; can need wiping": 69,
  "mixed to good depending on rubber": 56,
  "polarizing; clean-court dependent": 42,
  "good after outsole revision; more mixed before": 71,
  "very good indoors, less loved outdoors": 82,
  "good outdoors": 73,
  "good indoors, decent outdoors": 74,
  "excellent on flow version": 98,
  "elite traction": 100,
  "top-tier traction": 100
};

export const FIT_BASE: Record<string, number> = {
  painful: 20,
  "poor fit": 30,
  "bad fit": 30,
  "heel slip": 52,
  roomy: 68,
  simple: 70,
  minimal: 70,
  "budget fit": 70,
  traditional: 74,
  straightforward: 76,
  comfortable: 78,
  accommodating: 79,
  "easy to wear": 80,
  "true to size": 82,
  secure: 84,
  structured: 85,
  natural: 85,
  snug: 86,
  athletic: 86,
  agile: 86,
  supportive: 87,
  "premium-feeling": 84,
  "premium feel": 84,
  "close-fitting": 86,
  "form-fitting": 90,
  "foot-hugging": 90,
  "performance fit": 90,
  "performance-ready": 90,
  "performance-oriented": 90,
  contained: 91,
  containment: 91,
  "one-piece fit": 89,
  "one-to-one": 93,
  "glove-like": 95,
  "very secure": 94,
  "locked-in": 95,
  "locked in": 95,
  "dialed-in": 95,
  "dialed in": 95,
  lockdown: 97,
  "excellent lockdown": 98,
  "elite containment": 99,
  "hall-of-fame level lockdown": 100
};

export const FIT_POSITIVE_MODIFIERS: Record<string, number> = {
  "once broken in": 2,
  "broken in": 2,
  "after break-in": 2,
  "glove-like": 4,
  "one-to-one": 4,
  "very secure": 4,
  "excellent lockdown": 5,
  "elite containment": 5,
  "hall-of-fame level lockdown": 6,
  "foot-hugging": 4,
  "form-fitting": 3,
  "heel-contained": 3,
  "midfoot cage": 2,
  "strap helps": 2,
  "strap lockdown": 3
};

export const FIT_NEGATIVE_MODIFIERS: Record<string, number> = {
  "tricky entry": -6,
  "entry is tricky": -6,
  tight: -6,
  "slightly tight": -4,
  "can feel tight": -5,
  narrow: -5,
  narrower: -5,
  "somewhat narrow": -4,
  "slightly narrow": -3,
  "not wide-foot friendly": -8,
  "heel slip": -10,
  "minor heel slip": -3,
  "heel slip reported often": -12,
  polarizing: -8,
  painful: -20,
  bulky: -4,
  overbuilt: -5,
  substantial: -3,
  "not luxurious": -2,
  "not roomy": -3,
  "not especially streamlined": -3,
  "not the most contained laterally": -5,
  "rear feels minimal": -4,
  "can feel high in the heel": -4,
  "quirky entry": -4,
  "snug at first": -2
};

export const FIT_EXACT: Record<string, number> = {
  "secure and supportive": 90,
  "secure and true to size": 86,
  "secure and easy to wear": 84,
  "secure and comfortable": 83,
  "secure and straightforward": 82,
  "secure and accommodating": 84,
  "secure and natural": 86,
  "secure and agile": 87,
  "secure and athletic": 87,
  "secure and polished": 86,
  "secure and streamlined": 87,
  "secure and premium-feeling": 86,
  "supportive and structured": 89,
  "snug and secure": 90,
  "snug and very secure": 92,
  "snug and natural": 88,
  "snug performance fit": 90,
  "locked-in speed fit": 95,
  "secure one-to-one fit": 94,
  "secure and glove-like": 96,
  "excellent containment once sized right": 97,
  "excellent lockdown": 98,
  "hall-of-fame level lockdown": 100,
  "forefoot secure; heel slip reported often": 62,
  "secure but can feel tight in front": 77,
  "secure but simple": 78,
  "secure budget fit": 70,
  "simple, narrow, low-volume fit": 63,
  "very polarizing; tight and painful for some": 20
};

export const CUSHIONING_FEEL_EXACT: Record<string, number> = {
  "very plush and springy": 96,
  "very plush and protective": 96,
  "maximum, plush, and bouncy": 97,
  "highly plush and protective": 95,
  "very plush and impact-protective": 95,
  "plush and energetic": 90,
  "plush and protective": 91,
  "plush and springy": 90,
  "plush and smooth": 88,
  "plush and lively": 88,
  "plush and stable": 85,
  "plush and substantial": 86,
  "plush yet playable": 86,
  "plush but still controlled": 84,
  "plush but still fairly quick": 84,
  "springy and high-end": 92,
  "soft, springy, protective": 89,
  "soft, springy, modern": 88,
  "soft and bouncy": 87,
  "bouncy and modern": 87,
  "bouncy yet controlled": 89,
  "protective and lively": 84,
  "protective and balanced": 79,
  "protective and supportive": 80,
  "protective and modern": 80,
  "comfortable and cushioned": 80,
  "comfortable and protective": 79,
  "responsive and springy": 85,
  "responsive and bouncy": 86,
  "responsive and lively": 82,
  "responsive and smooth": 80,
  "responsive and protective": 80,
  "responsive and stable": 79,
  "responsive and quick": 78,
  "responsive and low-profile": 75,
  "responsive with enough protection": 81,
  "balanced and lively": 79,
  "balanced and energetic": 80,
  "balanced and responsive": 78,
  "balanced and supportive": 78,
  "balanced and comfortable": 77,
  "balanced and smooth": 75,
  "balanced and versatile": 76,
  "balanced and practical": 70,
  "balanced and quick": 74,
  "balanced and direct": 72,
  "balanced and slightly plush": 79,
  "balanced to slightly plush": 79,
  "balanced and slightly firm": 70,
  "balanced to slightly firm": 70,
  "soft-balanced": 80,
  "firm-responsive": 62,
  "firm-balanced": 58,
  "firm and fast": 60,
  "firm and direct": 56,
  "firm and supportive": 58,
  "firm-protective": 52,
  "firm old-school protection": 50,
  "firm-protective old-school feel": 48,
  "firm and highly structured": 46,
  "firm and somewhat caged": 44,
  "firm-light and fast": 58,
  "firm, functional": 55,
  firm: 45,
  "simple and practical": 55,
  "simple and balanced": 60,
  "simple and slightly firm": 54,
  "muted but smooth": 60,
  "decent to good, not plush": 68,
  "very plush": 93,
  balanced: 74
};

export const CUSHIONING_FEEL_BASE: Record<string, number> = {
  "very plush": 93,
  plush: 88,
  soft: 84,
  springy: 84,
  bouncy: 86,
  protective: 80,
  cushioned: 80,
  comfortable: 76,
  lively: 80,
  energetic: 80,
  responsive: 78,
  smooth: 76,
  balanced: 74,
  versatile: 76,
  direct: 72,
  quick: 74,
  "low-profile": 75,
  "firm-responsive": 62,
  "firm-balanced": 58,
  firm: 45,
  simple: 55,
  muted: 60
};

export const CUSHIONING_FEEL_MODIFIERS: Record<string, number> = {
  very: 5,
  highly: 5,
  premium: 3,
  "high-end": 4,
  protective: 3,
  springy: 3,
  bouncy: 4,
  lively: 2,
  energetic: 2,
  "old-school": -6,
  simple: -5,
  practical: -3,
  firm: -8,
  "low-profile": -3,
  direct: -2
};

export const COURT_FEEL_EXACT: Record<string, number> = {
  "below average": 28,
  low: 35,
  "low-moderate": 45,
  "moderate-low": 55,
  moderate: 64,
  "decent-moderate": 62,
  decent: 68,
  "moderate-high": 78,
  good: 82,
  "good to very good": 85,
  "very good": 88,
  high: 92,
  "very high": 96,
  excellent: 98,
  elite: 100,
  "high for the cushion level": 90,
  "moderate to slightly muted": 60,
  "moderate rather than ultra-low": 62,
  "moderate; lower than vol. 2": 61,
  "moderate-high in quick setup": 80,
  "moderate-high for a boost shoe": 79,
  "standard higher / infinity lower through rocker feel": 70,
  "better than prior air max lebrons": 74,
  "much better than most lebrons": 78,
  "better than 11": 72,
  "low for an early lebron": 38,
  "less grounded": 42,
  "less direct": 46,
  "less court-connected": 40,
  "lower through rocker feel": 72
};

export const COURT_FEEL_BASE: Record<string, number> = {
  "very poor": 18,
  "very low": 25,
  "below average": 28,
  low: 35,
  "low-moderate": 45,
  "moderate-low": 55,
  muted: 50,
  moderate: 64,
  "decent-moderate": 62,
  decent: 68,
  "moderate-high": 78,
  good: 82,
  "good to very good": 85,
  "very good": 88,
  high: 92,
  "very high": 96,
  excellent: 98,
  elite: 100,
  // Compound positive phrases — these read like "low" but mean very-grounded (high court feel)
  "low to the floor": 90,
  "close to the floor": 88,
  "court-connected": 86,
  "grounded": 84,
  "ultra-low": 92
};

export const COURT_FEEL_MODIFIERS: Record<string, number> = {
  "ultra-low": 6,
  "low to the floor": 5,
  grounded: 4,
  direct: 3,
  lower: 2,
  muted: -4,
  "less grounded": -8,
  "less direct": -6,
  "less court-connected": -10,
  "rocker feel": -3,
  higher: -4
};

export const BOUNCE_EXACT: Record<string, number> = {
  "below expectation for the tech package": 24,
  low: 30,
  "low-moderate": 40,
  limited: 45,
  "limited-moderate": 50,
  moderate: 58,
  "moderate-good": 68,
  "moderate to good": 66,
  good: 75,
  "good-excellent": 84,
  "very good": 88,
  high: 92,
  excellent: 98,
  elite: 100,
  "top-tier": 100,
  "top tier": 100,
  "good for a foam setup": 76,
  "good without feeling mushy": 77,
  "good, classic boost spring": 80
};

export const BOUNCE_BASE: Record<string, number> = {
  "below expectation": 30,
  "very poor": 14,
  poor: 22,
  low: 30,
  "low-moderate": 40,
  limited: 45,
  "limited-moderate": 50,
  moderate: 58,
  "moderate-good": 68,
  "moderate to good": 66,
  decent: 64,
  good: 75,
  "good-excellent": 84,
  "very good": 88,
  high: 92,
  great: 92,
  excellent: 98,
  elite: 100,
  snappy: 82,
  springy: 82,
  bouncy: 82,
  energetic: 80,
  lively: 80
};

export const BOUNCE_MODIFIERS: Record<string, number> = {
  spring: 3,
  springy: 4,
  bouncy: 5,
  energetic: 2,
  lively: 2,
  snappy: 3,
  mushy: -4,
  muted: -4,
  flat: -6,
  dead: -10,
  sluggish: -5,
  "below expectation": -10
};

// ============================================================
//  Universal sentiment dictionaries (fallback for arbitrary text)
// ============================================================

const UNIVERSAL_POSITIVE: Record<string, number> = {
  excellent: 24,
  elite: 28,
  outstanding: 22,
  superb: 22,
  exceptional: 22,
  fantastic: 20,
  amazing: 20,
  incredible: 22,
  remarkable: 18,
  great: 18,
  impressive: 16,
  premium: 14,
  refined: 11,
  polished: 10,
  good: 12,
  solid: 10,
  nice: 7,
  decent: 4,
  comfortable: 10,
  responsive: 9,
  bouncy: 11,
  springy: 11,
  snappy: 9,
  plush: 13,
  soft: 8,
  cushioned: 8,
  protective: 10,
  supportive: 10,
  secure: 9,
  stable: 11,
  balanced: 5,
  smooth: 6,
  reliable: 8,
  consistent: 6,
  versatile: 7,
  modern: 4,
  energetic: 9,
  lively: 9,
  satisfying: 8,
  effective: 8,
  strong: 12,
  durable: 6,
  grippy: 11,
  sticky: 9,
  locked: 9,
  contained: 9,
  natural: 5,
  fast: 7,
  quick: 6,
  agile: 7,
  light: 5,
  performance: 6
};

const UNIVERSAL_NEGATIVE: Record<string, number> = {
  poor: -22,
  bad: -22,
  terrible: -28,
  awful: -26,
  painful: -25,
  weak: -18,
  limited: -10,
  mixed: -8,
  mediocre: -12,
  disappointing: -15,
  underwhelming: -14,
  uncomfortable: -14,
  bulky: -7,
  overbuilt: -5,
  flimsy: -12,
  unstable: -14,
  wobbly: -12,
  tippy: -10,
  slippery: -16,
  sloppy: -10,
  inconsistent: -10,
  unreliable: -12,
  cheap: -10,
  flat: -8,
  dead: -14,
  mushy: -8,
  rough: -8,
  harsh: -10,
  noisy: -3,
  squeaky: -3,
  narrow: -4,
  tight: -5,
  clunky: -10,
  firm: -6,
  muted: -5,
  lacking: -12,
  lacks: -12,
  polarizing: -8,
  problematic: -10,
  iffy: -8,
  questionable: -8
};

const INTENSIFIERS: Record<string, number> = {
  very: 1.4,
  extremely: 1.6,
  highly: 1.4,
  super: 1.4,
  incredibly: 1.5,
  exceptionally: 1.5,
  remarkably: 1.4,
  truly: 1.2,
  really: 1.2,
  noticeably: 1.2,
  particularly: 1.2,
  notably: 1.2
};

const DAMPENERS: Record<string, number> = {
  slightly: 0.55,
  somewhat: 0.6,
  fairly: 0.8,
  reasonably: 0.85,
  moderately: 0.85,
  mostly: 0.95,
  kinda: 0.6,
  rather: 0.85
};

const NEGATORS = new Set([
  "not",
  "no",
  "isn't",
  "wasn't",
  "aren't",
  "weren't",
  "don't",
  "doesn't",
  "didn't",
  "won't",
  "without",
  "never",
  "lacks",
  "lacking"
]);

// ============================================================
//  Helpers
// ============================================================

export function normalizeScoreText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(DASH_VARIANTS_REGEX, "-")
    .replace(QUOTE_REGEX, "")
    .replace(/\s*([;,])\s*/g, "$1 ")
    .replace(/\s*\/\s*/g, " / ")
    .replace(SPACE_REGEX, " ")
    .trim();
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function normalizeMap(map: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(map).map(([phrase, score]) => [normalizeScoreText(phrase), score])
  );
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type Range = { start: number; end: number };

// Word-bounded substring: phrase boundaries must not be against ASCII word chars.
// Hyphens/spaces inside phrases are matched literally; tokens like "very" won't match inside "every".
function wordBoundedIndexOf(text: string, phrase: string): number {
  if (!phrase) return -1;
  const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(phrase)}(?![A-Za-z0-9])`);
  const m = re.exec(text);
  return m ? m.index : -1;
}

function overlapsAny(range: Range, others: Range[]): boolean {
  return others.some((r) => range.start < r.end && range.end > r.start);
}

type AnchorMatch = { phrase: string; score: number; range: Range };

function findLongestMatch(text: string, dict: Record<string, number>): AnchorMatch | null {
  const phrases = Object.keys(dict).sort((a, b) => b.length - a.length);
  for (const phrase of phrases) {
    const idx = wordBoundedIndexOf(text, phrase);
    if (idx >= 0) {
      return { phrase, score: dict[phrase], range: { start: idx, end: idx + phrase.length } };
    }
  }
  return null;
}

function pickAnchor(a: AnchorMatch | null, b: AnchorMatch | null): AnchorMatch | null {
  if (!a) return b;
  if (!b) return a;
  // Prefer the longer phrase (more specific). Break ties by higher absolute deviation
  // from 50 (more informative signal).
  const lenA = a.range.end - a.range.start;
  const lenB = b.range.end - b.range.start;
  if (lenA !== lenB) return lenA > lenB ? a : b;
  return Math.abs(a.score - 50) >= Math.abs(b.score - 50) ? a : b;
}

function sumModifiersOnce(
  text: string,
  modifiers: Record<string, number>,
  preConsumed: Range[] = []
): number {
  const phrases = Object.keys(modifiers).sort((a, b) => b.length - a.length);
  const consumed: Range[] = [...preConsumed];
  let total = 0;

  for (const phrase of phrases) {
    if (!phrase) continue;
    const re = new RegExp(`(?<![A-Za-z0-9])${escapeRegex(phrase)}(?![A-Za-z0-9])`, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const range = { start: match.index, end: match.index + phrase.length };
      if (!overlapsAny(range, consumed)) {
        consumed.push(range);
        total += modifiers[phrase];
      }
      if (re.lastIndex === match.index) re.lastIndex++;
    }
  }
  return total;
}

function isNegated(text: string, beforeIndex: number, lookbackChars = 18): boolean {
  const pre = text.slice(Math.max(0, beforeIndex - lookbackChars), beforeIndex);
  const tokens = pre
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const recent = tokens.slice(-3);
  return recent.some((t) => NEGATORS.has(t));
}

function applyNegation(score: number, defaultScore: number): number {
  // Mirror the deviation around the dimension default with a mild dampener
  return clampScore(defaultScore - (score - defaultScore) * 0.85);
}

// ============================================================
//  Sentiment fallback (used when EXACT and BASE both miss)
// ============================================================

const NORMALIZED_UNIVERSAL_POSITIVE = normalizeMap(UNIVERSAL_POSITIVE);
const NORMALIZED_UNIVERSAL_NEGATIVE = normalizeMap(UNIVERSAL_NEGATIVE);
const NORMALIZED_INTENSIFIERS = normalizeMap(INTENSIFIERS);
const NORMALIZED_DAMPENERS = normalizeMap(DAMPENERS);

type Extras = { positive?: Record<string, number>; negative?: Record<string, number> };

const TOKEN_REGEX = /[A-Za-z0-9'-]+/g;

type Token = { tok: string; start: number; end: number };

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  TOKEN_REGEX.lastIndex = 0;
  while ((m = TOKEN_REGEX.exec(text)) !== null) {
    out.push({ tok: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function lookupSentimentValue(tok: string, extras?: Extras): number {
  if (extras?.positive && tok in extras.positive) return extras.positive[tok];
  if (tok in NORMALIZED_UNIVERSAL_POSITIVE) return NORMALIZED_UNIVERSAL_POSITIVE[tok];
  if (extras?.negative && tok in extras.negative) return extras.negative[tok];
  if (tok in NORMALIZED_UNIVERSAL_NEGATIVE) return NORMALIZED_UNIVERSAL_NEGATIVE[tok];
  return 0;
}

// Sentiment scan over tokens, respecting consumed ranges. Returns the additive delta.
function sentimentDelta(text: string, consumed: Range[], extras?: Extras): number {
  const tokens = tokenize(text);
  let total = 0;
  for (let i = 0; i < tokens.length; i++) {
    const { tok, start, end } = tokens[i];
    if (overlapsAny({ start, end }, consumed)) continue;

    const value = lookupSentimentValue(tok, extras);
    if (value === 0) continue;

    let mult = 1;
    let negated = false;
    for (let j = Math.max(0, i - 2); j < i; j++) {
      const prev = tokens[j].tok;
      if (NEGATORS.has(prev)) negated = !negated;
      if (prev in NORMALIZED_INTENSIFIERS) mult *= NORMALIZED_INTENSIFIERS[prev];
      else if (prev in NORMALIZED_DAMPENERS) mult *= NORMALIZED_DAMPENERS[prev];
    }
    total += value * mult * (negated ? -1 : 1);
  }
  return total;
}

// Used when EXACT/BASE both miss. Builds a score from default + sentiment scan.
function sentimentScore(text: string, defaultScore: number, extras?: Extras): number {
  const delta = sentimentDelta(text, [], extras);
  if (delta === 0) return defaultScore;
  return clampScore(defaultScore + delta);
}

// Boost the anchor's deviation from default when preceded by intensifiers/dampeners.
function intensifierBoost(text: string, anchor: AnchorMatch, defaultScore: number): number {
  const pre = text.slice(Math.max(0, anchor.range.start - 24), anchor.range.start);
  const recent = tokenize(pre).slice(-2).map((t) => t.tok);
  let multBoost = 1;
  for (const t of recent) {
    if (NEGATORS.has(t)) continue;
    if (t in NORMALIZED_INTENSIFIERS) multBoost *= NORMALIZED_INTENSIFIERS[t];
    else if (t in NORMALIZED_DAMPENERS) multBoost *= NORMALIZED_DAMPENERS[t];
  }
  if (multBoost === 1) return 0;
  const deviation = anchor.score - defaultScore;
  return deviation * (multBoost - 1);
}

// ============================================================
//  Generic dimension scoring engine
// ============================================================

type DimensionConfig = {
  default: number;
  exact: Record<string, number>;
  base?: Record<string, number>;
  positiveMods?: Record<string, number>;
  negativeMods?: Record<string, number>;
};

function scoreDimension(rawText: string, cfg: DimensionConfig): number {
  const normalized = normalizeScoreText(rawText);
  if (!normalized) return cfg.default;

  // 1. EXACT full-string match — highest precision short-circuit.
  if (normalized in cfg.exact) return clampScore(cfg.exact[normalized]);

  // 2. Pick anchor = longest match across EXACT-substring + BASE-substring.
  //    Picking the longer phrase avoids "low" hijacking "low to the floor".
  const exactAnchor = findLongestMatch(normalized, cfg.exact);
  const baseAnchor = cfg.base ? findLongestMatch(normalized, cfg.base) : null;
  const anchor = pickAnchor(exactAnchor, baseAnchor);

  if (anchor) {
    const consumed: Range[] = [anchor.range];
    let score = anchor.score;

    // Modifiers outside the anchor's range.
    if (cfg.positiveMods) score += sumModifiersOnce(normalized, cfg.positiveMods, consumed);
    if (cfg.negativeMods) score += sumModifiersOnce(normalized, cfg.negativeMods, consumed);

    // Intensifier/dampener on the anchor itself (e.g. "extremely plush").
    score += intensifierBoost(normalized, anchor, cfg.default);

    // Free-form sentiment on remaining tokens (e.g. "amazing" alongside "bouncy").
    score += sentimentDelta(normalized, consumed, {
      positive: cfg.positiveMods,
      negative: cfg.negativeMods
    });

    // Negation around the anchor flips the deviation back toward the default.
    if (isNegated(normalized, anchor.range.start)) {
      score = applyNegation(score, cfg.default);
    }

    return clampScore(score);
  }

  // 3. Pure sentiment fallback — keeps arbitrary free-form text from collapsing to default.
  return sentimentScore(normalized, cfg.default, {
    positive: cfg.positiveMods,
    negative: cfg.negativeMods
  });
}

// ============================================================
//  Pre-normalized maps
// ============================================================

const NORMALIZED_STABILITY_EXACT = normalizeMap(STABILITY_EXACT);
const NORMALIZED_STABILITY_BASE = normalizeMap(STABILITY_BASE);
const NORMALIZED_STABILITY_MODIFIERS = normalizeMap(STABILITY_MODIFIERS);

const NORMALIZED_TRACTION_EXACT = normalizeMap(TRACTION_EXACT);
const NORMALIZED_TRACTION_BASE = normalizeMap(TRACTION_BASE);
const NORMALIZED_TRACTION_MODIFIERS = normalizeMap(TRACTION_MODIFIERS);

const NORMALIZED_FIT_EXACT = normalizeMap(FIT_EXACT);
const NORMALIZED_FIT_BASE = normalizeMap(FIT_BASE);
const NORMALIZED_FIT_POSITIVE_MODIFIERS = normalizeMap(FIT_POSITIVE_MODIFIERS);
const NORMALIZED_FIT_NEGATIVE_MODIFIERS = normalizeMap(FIT_NEGATIVE_MODIFIERS);

const NORMALIZED_CUSHIONING_FEEL_EXACT = normalizeMap(CUSHIONING_FEEL_EXACT);
const NORMALIZED_CUSHIONING_FEEL_BASE = normalizeMap(CUSHIONING_FEEL_BASE);
const NORMALIZED_CUSHIONING_FEEL_MODIFIERS = normalizeMap(CUSHIONING_FEEL_MODIFIERS);

const NORMALIZED_COURT_FEEL_EXACT = normalizeMap(COURT_FEEL_EXACT);
const NORMALIZED_COURT_FEEL_BASE = normalizeMap(COURT_FEEL_BASE);
const NORMALIZED_COURT_FEEL_MODIFIERS = normalizeMap(COURT_FEEL_MODIFIERS);

const NORMALIZED_BOUNCE_EXACT = normalizeMap(BOUNCE_EXACT);
const NORMALIZED_BOUNCE_BASE = normalizeMap(BOUNCE_BASE);
const NORMALIZED_BOUNCE_MODIFIERS = normalizeMap(BOUNCE_MODIFIERS);

// Partition modifier dicts into positive/negative by sign so the engine can
// route fallback sentiment through dimension-specific words too.
function splitBySign(map: Record<string, number>): {
  positive: Record<string, number>;
  negative: Record<string, number>;
} {
  const positive: Record<string, number> = {};
  const negative: Record<string, number> = {};
  for (const [k, v] of Object.entries(map)) {
    if (v >= 0) positive[k] = v;
    else negative[k] = v;
  }
  return { positive, negative };
}

const STABILITY_MODS_SPLIT = splitBySign(NORMALIZED_STABILITY_MODIFIERS);
const TRACTION_MODS_SPLIT = splitBySign(NORMALIZED_TRACTION_MODIFIERS);
const CUSHIONING_MODS_SPLIT = splitBySign(NORMALIZED_CUSHIONING_FEEL_MODIFIERS);
const COURT_FEEL_MODS_SPLIT = splitBySign(NORMALIZED_COURT_FEEL_MODIFIERS);
const BOUNCE_MODS_SPLIT = splitBySign(NORMALIZED_BOUNCE_MODIFIERS);

// ============================================================
//  Public scoring API
// ============================================================

export function getStabilityScore(text: string) {
  return scoreDimension(text, {
    default: STABILITY_DEFAULT,
    exact: NORMALIZED_STABILITY_EXACT,
    base: NORMALIZED_STABILITY_BASE,
    positiveMods: STABILITY_MODS_SPLIT.positive,
    negativeMods: STABILITY_MODS_SPLIT.negative
  });
}

export function getTractionScore(text: string) {
  return scoreDimension(text, {
    default: TRACTION_DEFAULT,
    exact: NORMALIZED_TRACTION_EXACT,
    base: NORMALIZED_TRACTION_BASE,
    positiveMods: TRACTION_MODS_SPLIT.positive,
    negativeMods: TRACTION_MODS_SPLIT.negative
  });
}

export function getFitScore(text: string) {
  return scoreDimension(text, {
    default: FIT_DEFAULT,
    exact: NORMALIZED_FIT_EXACT,
    base: NORMALIZED_FIT_BASE,
    positiveMods: NORMALIZED_FIT_POSITIVE_MODIFIERS,
    negativeMods: NORMALIZED_FIT_NEGATIVE_MODIFIERS
  });
}

export function getCushioningFeelScore(text: string) {
  return scoreDimension(text, {
    default: CUSHIONING_FEEL_DEFAULT,
    exact: NORMALIZED_CUSHIONING_FEEL_EXACT,
    base: NORMALIZED_CUSHIONING_FEEL_BASE,
    positiveMods: CUSHIONING_MODS_SPLIT.positive,
    negativeMods: CUSHIONING_MODS_SPLIT.negative
  });
}

export function getCourtFeelScore(text: string) {
  return scoreDimension(text, {
    default: COURT_FEEL_DEFAULT,
    exact: NORMALIZED_COURT_FEEL_EXACT,
    base: NORMALIZED_COURT_FEEL_BASE,
    positiveMods: COURT_FEEL_MODS_SPLIT.positive,
    negativeMods: COURT_FEEL_MODS_SPLIT.negative
  });
}

export function getBounceScore(text: string) {
  return scoreDimension(text, {
    default: BOUNCE_DEFAULT,
    exact: NORMALIZED_BOUNCE_EXACT,
    base: NORMALIZED_BOUNCE_BASE,
    positiveMods: BOUNCE_MODS_SPLIT.positive,
    negativeMods: BOUNCE_MODS_SPLIT.negative
  });
}

export function getPerformanceLabel(score: number): string {
  if (score <= 24) return "Weak";
  if (score <= 39) return "Below Average";
  if (score <= 54) return "Decent";
  if (score <= 64) return "Solid";
  if (score <= 74) return "Good";
  if (score <= 84) return "Very Good";
  if (score <= 94) return "Excellent";
  return "Elite";
}
