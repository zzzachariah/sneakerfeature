export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Position = (typeof POSITIONS)[number];

export const SKILL_LEVELS = ["beginner", "amateur", "semi_pro", "pro"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

// Injury-history areas the Pro deep questionnaire can flag. Each key maps to a
// protective-scoring dimension in lib/match/score.ts (e.g. an ankle history
// rewards containment + support; knee issues reward impact cushioning).
export const INJURY_KEYS = ["ankle", "knee", "achilles", "plantar"] as const;
export type InjuryKey = (typeof INJURY_KEYS)[number];

export type Persona = {
  positions: Position[];
  skill_level: SkillLevel;
  flat_foot: boolean;
  height_cm: number;
  weight_kg: number;
  /** Pro+ deep-questionnaire injury history; absent/empty for members who
   *  haven't filled it in (older saved personas simply lack the key). */
  injuries?: InjuryKey[];
};

export const HEIGHT_MIN = 140;
export const HEIGHT_MAX = 230;
export const WEIGHT_MIN = 35;
export const WEIGHT_MAX = 160;

export const POSITION_LABEL: Record<Position, string> = {
  PG: "PG",
  SG: "SG",
  SF: "SF",
  PF: "PF",
  C: "C"
};

export const SKILL_LEVEL_LABEL: Record<SkillLevel, string> = {
  beginner: "Beginner",
  amateur: "Amateur",
  semi_pro: "Semi-pro",
  pro: "Pro"
};

// English labels; the zh UI translates them via the locale dictionary.
export const INJURY_LABEL: Record<InjuryKey, string> = {
  ankle: "Ankle sprains",
  knee: "Knee soreness",
  achilles: "Achilles strain",
  plantar: "Plantar fasciitis"
};

// One-line explanation of what the matcher does with each flag.
export const INJURY_HINT: Record<InjuryKey, string> = {
  ankle: "Prioritizes containment, ankle support and stable bases",
  knee: "Prioritizes impact-absorbing cushioning setups",
  achilles: "Prioritizes forgiving heel cushioning and smooth transitions",
  plantar: "Prioritizes arch support and torsional rigidity"
};

export function isValidInjuries(value: unknown): value is InjuryKey[] {
  if (!Array.isArray(value)) return false;
  if (value.length > INJURY_KEYS.length) return false;
  if (new Set(value).size !== value.length) return false;
  return value.every((k) => INJURY_KEYS.includes(k as InjuryKey));
}

export function isValidPersona(value: unknown): value is Persona {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<Persona>;
  if (!Array.isArray(v.positions)) return false;
  if (v.positions.length < 1 || v.positions.length > 2) return false;
  if (new Set(v.positions).size !== v.positions.length) return false;
  for (const p of v.positions) {
    if (!POSITIONS.includes(p as Position)) return false;
  }
  if (typeof v.skill_level !== "string" || !SKILL_LEVELS.includes(v.skill_level as SkillLevel)) {
    return false;
  }
  if (typeof v.flat_foot !== "boolean") return false;
  if (typeof v.height_cm !== "number" || v.height_cm < HEIGHT_MIN || v.height_cm > HEIGHT_MAX) {
    return false;
  }
  if (typeof v.weight_kg !== "number" || v.weight_kg < WEIGHT_MIN || v.weight_kg > WEIGHT_MAX) {
    return false;
  }
  // Older personas predate the injuries key; only validate it when present.
  if (v.injuries !== undefined && !isValidInjuries(v.injuries)) return false;
  return true;
}
