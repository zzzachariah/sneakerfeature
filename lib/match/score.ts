import { keywordScore, hasAffirmedSignal } from "@/lib/match/evidence";
import type { InjuryKey, Persona, Position } from "@/lib/persona/types";
import type { Shoe } from "@/lib/types";

export const WEIGHTS = {
  position: 30,
  weight: 20,
  flatFoot: 20,
  skill: 20,
  height: 10,
  protection: 24
} as const;

// The denominator renormalizes over applicable dims, so `protection` joining
// the mix (only when the Pro deep questionnaire flagged injuries AND the shoe
// carries usable signals) leaves personas without injuries scoring EXACTLY as
// before. With it active its relative share is 0.24/1.24 ≈ 19%.
const BASE_WEIGHTS = {
  position: 0.30,
  weight: 0.18,
  flatFoot: 0.17,
  skill: 0.25,
  height: 0.10,
  protection: 0.24
} as const;

const GUARD_POSITIONS: Position[] = ["PG", "SG"];
const WING_POSITIONS: Position[] = ["SG", "SF"];
const BIG_POSITIONS: Position[] = ["PF", "C"];

type DimResult = { score: number; applicable: boolean };
type DimensionKey = "position" | "weight" | "flatFoot" | "skill" | "height" | "protection";

export function parseShoeWeightOz(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /(?<![-\d.])([\d.]+)\s*oz/i.exec(raw);
  if (m) { const value = Number(m[1]); return Number.isFinite(value) && value > 0 && value < 40 ? value : null; }
  const g = /(?<![-\d.])([\d.]+)\s*g\b/i.exec(raw);
  if (g) { const value = Number(g[1]) / 28.3495; return Number.isFinite(value) && value > 0 && value < 40 ? value : null; }
  return null;
}

function positionDimension(shoe: Shoe, positions: Position[]): DimResult {
  if (!shoe.category) return { score: 0, applicable: false };
  const cat = shoe.category.toLowerCase();
  const matchAny = (set: Position[]) => positions.some((p) => set.includes(p));

  if (/\b(?:all[- ]?(?:around|round|court)|hybrid|versatile)\b/.test(cat) || /全能|全位置/.test(cat)) {
    return { score: 0.92, applicable: true };
  }
  if (cat.includes("guard")) {
    if (matchAny(GUARD_POSITIONS)) return { score: 1.0, applicable: true };
    if (matchAny(WING_POSITIONS)) return { score: 0.45, applicable: true };
    return { score: 0.10, applicable: true };
  }
  if (cat.includes("wing") || (cat.includes("forward") && !cat.includes("power"))) {
    if (matchAny(WING_POSITIONS)) return { score: 1.0, applicable: true };
    if (matchAny(GUARD_POSITIONS) || matchAny(["PF"])) return { score: 0.45, applicable: true };
    return { score: 0.15, applicable: true };
  }
  if (cat.includes("big") || cat.includes("center") || cat.includes("power")) {
    if (matchAny(BIG_POSITIONS)) return { score: 1.0, applicable: true };
    if (matchAny(["SF"])) return { score: 0.45, applicable: true };
    return { score: 0.10, applicable: true };
  }
  return { score: 0, applicable: false };
}

function weightDimension(shoe: Shoe, weightKg: number): DimResult {
  const oz = parseShoeWeightOz(shoe.weight);
  if (oz === null) return { score: 0, applicable: false };

  const ideal = Math.max(10.8, Math.min(14.2, 11.5 + (weightKg - 60) * 0.04));
  const diff = Math.abs(oz - ideal);
  const score = Math.max(0.05, 1 - diff / 3.0);
  return { score, applicable: true };
}

function flatFootDimension(shoe: Shoe, flatFoot: boolean): DimResult {
  if (!flatFoot) return { score: 0, applicable: false };
  const spec = shoe.spec ?? {};
  const candidates = [spec.stability, spec.support, spec.torsional_rigidity];
  const scores: number[] = [];
  for (const c of candidates) {
    const s = keywordScore(c);
    if (s !== null) scores.push(s);
  }
  if (scores.length < 2) return { score: 0, applicable: false };
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  return { score: avg, applicable: true };
}

const FORGIVING = ["soft", "plush", "stable", "forgiving", "smooth", "easy", "柔软", "舒适", "平顺", "稳定"];
const RESPONSIVE = ["responsive", "snappy", "low to the floor", "quick", "explosive", "fast", "灵敏", "敏捷", "贴地"];

function skillDimension(shoe: Shoe, skill: Persona["skill_level"]): DimResult {
  const spec = shoe.spec ?? {};
  const text = [
    spec.cushioning_feel,
    spec.court_feel,
    spec.bounce,
    spec.fit,
    spec.playstyle_summary
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!text) return { score: 0, applicable: false };

  const forgivingCount = FORGIVING.reduce((s, k) => (hasAffirmedSignal(text, [k]) ? s + 1 : s), 0);
  const responsiveCount = RESPONSIVE.reduce((s, k) => (hasAffirmedSignal(text, [k]) ? s + 1 : s), 0);

  if (!forgivingCount && !responsiveCount) return { score: 0, applicable: false };
  let score: number;
  if (skill === "beginner") {
    if (forgivingCount >= 2) score = 1.0;
    else if (forgivingCount === 1) score = 0.75;
    else if (responsiveCount >= 2) score = 0.20;
    else score = 0.45;
  } else if (skill === "amateur") {
    if (forgivingCount >= 1) score = 0.85;
    else if (responsiveCount >= 1) score = 0.70;
    else score = 0.55;
  } else if (skill === "semi_pro") {
    if (responsiveCount >= 2) score = 0.95;
    else if (responsiveCount === 1) score = 0.78;
    else if (forgivingCount >= 2) score = 0.40;
    else score = 0.55;
  } else {
    if (responsiveCount >= 2) score = 1.0;
    else if (responsiveCount === 1) score = 0.78;
    else if (forgivingCount >= 2) score = 0.25;
    else score = 0.50;
  }
  return { score, applicable: true };
}

// Height alone is not evidence of shoe compatibility or ankle protection.
function heightDimension(): DimResult { return { score: 0, applicable: false }; }

// ── Protection (Pro deep questionnaire) ─────────────────────────────────────
// Each flagged injury area reads its own protective signals off the spec text;
// the dimension is the average of the areas that had usable signals. Purely
// keyword-driven, same register as the other dimensions.

const CUSHION_PROTECTIVE = ["soft", "plush", "pillow", "bouncy", "thick", "max", "impact"];
const CUSHION_HARSH = ["firm", "minimal", "thin", "dead", "low to the ground", "harsh"];

function cushionComfortScore(spec: Shoe["spec"]): number | null {
  const text = [spec.cushioning_feel, spec.bounce].filter(Boolean).join(" ").toLowerCase();
  if (!text) return null;
  const protective = CUSHION_PROTECTIVE.reduce((s, k) => (hasAffirmedSignal(text, [k]) ? s + 1 : s), 0);
  const harsh = CUSHION_HARSH.reduce((s, k) => (hasAffirmedSignal(text, [k]) ? s + 1 : s), 0);
  if (!protective && !harsh) return null;
  if (protective >= 2) return harsh ? 0.55 : 1.0;
  if (protective === 1) return harsh > 0 ? 0.55 : 0.80;
  if (harsh >= 2) return 0.10;
  if (harsh === 1) return 0.30;
  return 0.50;
}

function injuryScore(shoe: Shoe, injury: InjuryKey): number | null {
  const spec = shoe.spec ?? {};

  if (injury === "ankle") {
    const signals: number[] = [];
    for (const c of [spec.support, spec.containment, spec.stability]) {
      const s = keywordScore(c);
      if (s !== null) signals.push(s);
    }
    if (signals.length < 2) return null;
    return signals.reduce((a, b) => a + b, 0) / signals.length;
  }

  if (injury === "knee") {
    return cushionComfortScore(spec);
  }

  if (injury === "achilles") {
    return cushionComfortScore(spec);
  }

  // plantar — arch support + torsional rigidity carry the fascia.
  const signals: number[] = [];
  for (const c of [spec.torsional_rigidity, spec.stability, spec.support]) {
    const s = keywordScore(c);
    if (s !== null) signals.push(s);
  }
  if (signals.length < 2) return null;
  return signals.reduce((a, b) => a + b, 0) / signals.length;
}

function protectionDimension(shoe: Shoe, injuries: InjuryKey[] | undefined): DimResult {
  if (!injuries || injuries.length === 0) return { score: 0, applicable: false };
  const scores: number[] = [];
  for (const injury of injuries) {
    const s = injuryScore(shoe, injury);
    if (s !== null) scores.push(s);
  }
  if (scores.length === 0) return { score: 0, applicable: false };
  return { score: scores.reduce((a, b) => a + b, 0) / scores.length, applicable: true };
}

export function computeDimensions(persona: Persona, shoe: Shoe): Record<DimensionKey, DimResult> {
  return {
    position: positionDimension(shoe, persona.positions),
    weight: weightDimension(shoe, persona.weight_kg),
    flatFoot: flatFootDimension(shoe, persona.flat_foot),
    skill: skillDimension(shoe, persona.skill_level),
    height: heightDimension(),
    protection: protectionDimension(shoe, persona.injuries)
  };
}

function transformRaw(raw: number): number {
  const clamped = Math.max(0, Math.min(1, raw));
  return Math.max(30, Math.min(99, Math.round(30 + clamped * 69)));
}

export function computeMatchScore(persona: Persona, shoe: Shoe): number | null {
  const dims = computeDimensions(persona, shoe);
  let weighted = 0;
  let denom = 0;
  (Object.keys(dims) as DimensionKey[]).forEach((key) => {
    const d = dims[key];
    if (d.applicable) {
      weighted += d.score * BASE_WEIGHTS[key];
      denom += BASE_WEIGHTS[key];
    }
  });
  if (Object.values(dims).filter(d => d.applicable).length < 2 || denom === 0) return null;
  return transformRaw(weighted / denom);
}

const REASON_THRESHOLD = 0.65;

export function getMatchReasons(persona: Persona, shoe: Shoe): string[] {
  const dims = computeDimensions(persona, shoe);
  const reasons: string[] = [];
  if (computeMatchScore(persona, shoe) == null) return ["Not enough evidence for a personal match score"];

  if (dims.position.applicable && dims.position.score >= REASON_THRESHOLD) {
    const cat = (shoe.category ?? "").toLowerCase();
    if (cat.includes("guard")) reasons.push("Great for guards");
    else if (cat.includes("wing") || (cat.includes("forward") && !cat.includes("power"))) {
      reasons.push("Great for wings");
    } else if (cat.includes("big") || cat.includes("center") || cat.includes("power")) {
      reasons.push("Great for bigs");
    }
  }

  if (dims.flatFoot.applicable && dims.flatFoot.score >= REASON_THRESHOLD) {
    reasons.push("Catalog notes indicate support and stability");
  }

  if (dims.skill.applicable && dims.skill.score >= REASON_THRESHOLD) {
    if (persona.skill_level === "beginner" || persona.skill_level === "amateur") {
      reasons.push("Forgiving for beginners");
    } else {
      reasons.push("Responsive for advanced players");
    }
  }

  if (dims.weight.applicable && dims.weight.score >= REASON_THRESHOLD) {
    if (persona.weight_kg < 70) reasons.push("Lightweight for your build");
    else if (persona.weight_kg >= 85) reasons.push("Shoe weight near the profile estimate");
  }

  if (dims.protection.applicable && dims.protection.score >= REASON_THRESHOLD) {
    reasons.push("Support or cushioning notes align with your stated priorities");
  }
  reasons.push("Heuristic estimate from catalog notes, not a fit guarantee");

  return reasons.slice(0, 4);
}

/** Preserve genuine ties. Display order must never change a match score. */
export function spreadTiedScores(ranked: { id: string; score: number }[]): Map<string, number> {
  return new Map(ranked.map(({id,score}) => [id,score]));
}
