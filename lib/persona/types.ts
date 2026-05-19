export const POSITIONS = ["PG", "SG", "SF", "PF", "C"] as const;
export type Position = (typeof POSITIONS)[number];

export const SKILL_LEVELS = ["beginner", "amateur", "semi_pro", "pro"] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export type Persona = {
  positions: Position[];
  skill_level: SkillLevel;
  flat_foot: boolean;
  height_cm: number;
  weight_kg: number;
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
  return true;
}
