import type { Persona, Position } from "@/lib/persona/types";
import type { Shoe } from "@/lib/types";

export const WEIGHTS = {
  position: 30,
  weight: 20,
  flatFoot: 20,
  skill: 20,
  height: 10
} as const;

const GUARD_POSITIONS: Position[] = ["PG", "SG"];
const WING_POSITIONS: Position[] = ["SG", "SF"];
const BIG_POSITIONS: Position[] = ["PF", "C"];

export function parseShoeWeightOz(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const m = /([\d.]+)\s*oz/i.exec(raw);
  if (m) return parseFloat(m[1]);
  const g = /([\d.]+)\s*g\b/i.exec(raw);
  if (g) return parseFloat(g[1]) / 28.3495;
  return null;
}

function categoryFitness(category: string | null | undefined, positions: Position[]): number {
  if (!category) return 0.5;
  const cat = category.toLowerCase();
  const matchAny = (set: Position[]) => positions.some((p) => set.includes(p));

  if (cat.includes("all") || cat.includes("hybrid") || cat.includes("versatile")) return 1;

  if (cat.includes("guard")) {
    if (matchAny(GUARD_POSITIONS)) return 1;
    if (matchAny(WING_POSITIONS)) return 0.5;
    return 0.15;
  }
  if (cat.includes("wing") || cat.includes("forward") && !cat.includes("power")) {
    if (matchAny(WING_POSITIONS)) return 1;
    if (matchAny(GUARD_POSITIONS) || matchAny(["PF"])) return 0.5;
    return 0.2;
  }
  if (cat.includes("big") || cat.includes("center") || cat.includes("power")) {
    if (matchAny(BIG_POSITIONS)) return 1;
    if (matchAny(["SF"])) return 0.5;
    return 0.15;
  }
  return 0.5;
}

function weightFitness(weightOz: number | null, weightKg: number): number {
  if (weightOz === null) return 0.5;
  if (weightKg >= 85) {
    if (weightOz >= 13) return 1;
    if (weightOz >= 12) return 0.6;
    return 0.25;
  }
  if (weightKg < 70) {
    if (weightOz <= 12) return 1;
    if (weightOz <= 13) return 0.6;
    return 0.25;
  }
  if (weightOz >= 11.5 && weightOz <= 14) return 0.9;
  return 0.6;
}

const STRONG = ["good", "great", "excellent", "high", "strong", "elite", "best"];
const MEDIUM = ["decent", "moderate", "balanced", "solid", "stable", "adequate"];
const WEAK = ["low", "poor", "minimal", "thin", "soft only", "weak"];

function rateKeyword(text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.toLowerCase();
  if (STRONG.some((k) => t.includes(k))) return 1;
  if (MEDIUM.some((k) => t.includes(k))) return 0.5;
  if (WEAK.some((k) => t.includes(k))) return 0.15;
  return 0.4;
}

function flatFootFitness(shoe: Shoe, flatFoot: boolean): number {
  if (!flatFoot) return 0.7;
  const spec = shoe.spec ?? {};
  const scores = [
    rateKeyword(spec.stability ?? null),
    rateKeyword(spec.support ?? null),
    rateKeyword(spec.torsional_rigidity ?? null)
  ];
  return scores.reduce((s, v) => s + v, 0) / scores.length;
}

const FORGIVING = ["soft", "plush", "stable", "forgiving", "smooth", "easy"];
const RESPONSIVE = ["responsive", "snappy", "low", "court feel", "quick", "explosive", "fast"];

function skillFitness(shoe: Shoe, skill: Persona["skill_level"]): number {
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
  if (!text) return 0.5;

  const forgivingScore = FORGIVING.reduce((s, k) => (text.includes(k) ? s + 1 : s), 0);
  const responsiveScore = RESPONSIVE.reduce((s, k) => (text.includes(k) ? s + 1 : s), 0);

  if (skill === "beginner") {
    if (forgivingScore >= 2) return 1;
    if (forgivingScore === 1) return 0.7;
    if (responsiveScore >= 2) return 0.3;
    return 0.5;
  }
  if (skill === "amateur") {
    if (forgivingScore >= 1) return 0.85;
    if (responsiveScore >= 1) return 0.7;
    return 0.6;
  }
  if (skill === "semi_pro") {
    if (responsiveScore >= 1) return 0.9;
    if (forgivingScore >= 1) return 0.65;
    return 0.6;
  }
  if (responsiveScore >= 2) return 1;
  if (responsiveScore === 1) return 0.8;
  if (forgivingScore >= 2) return 0.4;
  return 0.55;
}

function heightFitness(shoe: Shoe, heightCm: number): number {
  const spec = shoe.spec ?? {};
  const tags = (spec.tags ?? []).map((t) => t.toLowerCase());
  const containmentScore = rateKeyword(spec.containment ?? null);
  const supportScore = rateKeyword(spec.support ?? null);
  const lowProfile = tags.some((t) => t.includes("low") || t.includes("speed") || t.includes("quick"));
  const highTop = tags.some((t) => t.includes("high") || t.includes("support") || t.includes("ankle"));

  if (heightCm >= 195) {
    return Math.max(containmentScore, supportScore, highTop ? 0.9 : 0);
  }
  if (heightCm < 175) {
    return Math.max(lowProfile ? 0.9 : 0, 1 - containmentScore * 0.4);
  }
  return 0.7;
}

export function computeMatchScore(persona: Persona, shoe: Shoe): number {
  const positionPart = categoryFitness(shoe.category, persona.positions) * WEIGHTS.position;
  const weightPart = weightFitness(parseShoeWeightOz(shoe.weight), persona.weight_kg) * WEIGHTS.weight;
  const flatFootPart = flatFootFitness(shoe, persona.flat_foot) * WEIGHTS.flatFoot;
  const skillPart = skillFitness(shoe, persona.skill_level) * WEIGHTS.skill;
  const heightPart = heightFitness(shoe, persona.height_cm) * WEIGHTS.height;

  const total = positionPart + weightPart + flatFootPart + skillPart + heightPart;
  return Math.max(0, Math.min(100, Math.round(total)));
}

const REASON_THRESHOLD = 0.6;

export function getMatchReasons(persona: Persona, shoe: Shoe): string[] {
  const reasons: string[] = [];

  const posFit = categoryFitness(shoe.category, persona.positions);
  if (posFit >= REASON_THRESHOLD) {
    const cat = (shoe.category ?? "").toLowerCase();
    if (cat.includes("guard")) reasons.push("Great for guards");
    else if (cat.includes("wing") || (cat.includes("forward") && !cat.includes("power"))) reasons.push("Great for wings");
    else if (cat.includes("big") || cat.includes("center") || cat.includes("power")) reasons.push("Great for bigs");
  }

  if (persona.flat_foot) {
    const ff = flatFootFitness(shoe, true);
    if (ff >= REASON_THRESHOLD) reasons.push("Stable for flat-footed players");
  }

  const skillFit = skillFitness(shoe, persona.skill_level);
  if (skillFit >= REASON_THRESHOLD) {
    if (persona.skill_level === "beginner" || persona.skill_level === "amateur") {
      reasons.push("Forgiving for beginners");
    } else {
      reasons.push("Responsive for advanced players");
    }
  }

  const weightFit = weightFitness(parseShoeWeightOz(shoe.weight), persona.weight_kg);
  if (weightFit >= REASON_THRESHOLD) {
    if (persona.weight_kg < 70) reasons.push("Lightweight for your build");
    else if (persona.weight_kg >= 85) reasons.push("Supportive for heavier players");
  }

  const heightFit = heightFitness(shoe, persona.height_cm);
  if (heightFit >= REASON_THRESHOLD) {
    if (persona.height_cm < 175) reasons.push("Low-profile for shorter players");
    else if (persona.height_cm >= 195) reasons.push("Containment for taller players");
  }

  return reasons.slice(0, 4);
}
