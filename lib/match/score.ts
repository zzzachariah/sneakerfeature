import type { Persona, Position } from "@/lib/persona/types";
import type { Shoe } from "@/lib/types";

export const WEIGHTS = {
  position: 30,
  weight: 20,
  flatFoot: 20,
  skill: 20,
  height: 10
} as const;

const BASE_WEIGHTS = {
  position: 0.30,
  weight: 0.18,
  flatFoot: 0.17,
  skill: 0.25,
  height: 0.10
} as const;

const GUARD_POSITIONS: Position[] = ["PG", "SG"];
const WING_POSITIONS: Position[] = ["SG", "SF"];
const BIG_POSITIONS: Position[] = ["PF", "C"];

type DimResult = { score: number; applicable: boolean };
type DimensionKey = "position" | "weight" | "flatFoot" | "skill" | "height";

export function parseShoeWeightOz(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /([\d.]+)\s*oz/i.exec(raw);
  if (m) return parseFloat(m[1]);
  const g = /([\d.]+)\s*g\b/i.exec(raw);
  if (g) return parseFloat(g[1]) / 28.3495;
  return null;
}

const STRONG = ["excellent", "elite", "outstanding", "very high"];
const GOOD = ["good", "great", "high", "strong"];
const MEDIUM = ["decent", "moderate", "balanced", "solid", "adequate"];
const WEAK = ["low", "poor", "minimal", "thin", "weak"];

function keywordScore(text: string | null | undefined): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (STRONG.some((k) => t.includes(k))) return 1.0;
  if (GOOD.some((k) => t.includes(k))) return 0.80;
  if (MEDIUM.some((k) => t.includes(k))) return 0.50;
  if (WEAK.some((k) => t.includes(k))) return 0.15;
  return 0.40;
}

function positionDimension(shoe: Shoe, positions: Position[]): DimResult {
  if (!shoe.category) return { score: 0, applicable: false };
  const cat = shoe.category.toLowerCase();
  const matchAny = (set: Position[]) => positions.some((p) => set.includes(p));

  if (cat.includes("all") || cat.includes("hybrid") || cat.includes("versatile")) {
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

const FORGIVING = ["soft", "plush", "stable", "forgiving", "smooth", "easy"];
const RESPONSIVE = ["responsive", "snappy", "low", "court feel", "quick", "explosive", "fast"];

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

  const forgivingCount = FORGIVING.reduce((s, k) => (text.includes(k) ? s + 1 : s), 0);
  const responsiveCount = RESPONSIVE.reduce((s, k) => (text.includes(k) ? s + 1 : s), 0);

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

function heightDimension(shoe: Shoe, heightCm: number): DimResult {
  if (heightCm >= 175 && heightCm <= 195) return { score: 0, applicable: false };

  const spec = shoe.spec ?? {};
  const tags = (spec.tags ?? []).map((t) => t.toLowerCase());
  const containment = keywordScore(spec.containment ?? null);
  const support = keywordScore(spec.support ?? null);
  const lowProfile = tags.some((t) => t.includes("low") || t.includes("speed") || t.includes("quick"));
  const highTop = tags.some((t) => t.includes("high") || t.includes("support") || t.includes("ankle"));

  if (heightCm > 195) {
    const signals: number[] = [];
    if (containment !== null) signals.push(containment);
    if (support !== null) signals.push(support);
    if (highTop) signals.push(0.92);
    if (signals.length === 0) return { score: 0.20, applicable: true };
    return { score: Math.max(...signals), applicable: true };
  }

  if (lowProfile) return { score: 0.95, applicable: true };
  if (containment !== null) {
    return { score: Math.max(0.20, 1 - containment * 0.7), applicable: true };
  }
  return { score: 0.30, applicable: true };
}

export function computeDimensions(persona: Persona, shoe: Shoe): Record<DimensionKey, DimResult> {
  return {
    position: positionDimension(shoe, persona.positions),
    weight: weightDimension(shoe, persona.weight_kg),
    flatFoot: flatFootDimension(shoe, persona.flat_foot),
    skill: skillDimension(shoe, persona.skill_level),
    height: heightDimension(shoe, persona.height_cm)
  };
}

function transformRaw(raw: number): number {
  const clamped = Math.max(0, Math.min(1, raw));
  return Math.max(30, Math.min(99, Math.round(30 + clamped * 69)));
}

export function computeMatchScore(persona: Persona, shoe: Shoe): number {
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
  const raw = denom > 0 ? weighted / denom : 0.5;
  return transformRaw(raw);
}

const REASON_THRESHOLD = 0.65;

export function getMatchReasons(persona: Persona, shoe: Shoe): string[] {
  const dims = computeDimensions(persona, shoe);
  const reasons: string[] = [];

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
    reasons.push("Stable for flat-footed players");
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
    else if (persona.weight_kg >= 85) reasons.push("Supportive for heavier players");
  }

  if (dims.height.applicable && dims.height.score >= REASON_THRESHOLD) {
    if (persona.height_cm < 175) reasons.push("Low-profile for shorter players");
    else if (persona.height_cm > 195) reasons.push("Containment for taller players");
  }

  return reasons.slice(0, 4);
}
