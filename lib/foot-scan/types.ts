// Shared types for the hidden Foot Scan feature.
//
// The flow: the user picks a best-fitting shoe (→ approximate foot length, the
// scale anchor), then captures a few guided photos. A vision model + light
// geometry turn those into three indicative foot-shape traits:
//   - width    (narrow / standard / wide / extra-wide)
//   - instep   (low / normal / high)
//   - toe shape(egyptian / greek / roman / square)
// Arch / flat-foot is intentionally out of v1 (needs a plantar view; see v2).

export type FootSide = "left" | "right";

// The four guided shots. The primary foot gets all three views; the other foot
// only needs a top-down for the left/right length+width comparison.
export type ViewId = "top" | "oblique" | "side" | "top_other";

export type WidthClass = "narrow" | "standard" | "wide" | "extra_wide";
export type InstepClass = "low" | "normal" | "high";
export type ToeShape = "egyptian" | "greek" | "roman" | "square";
export type Confidence = "low" | "medium" | "high";

export type FootMeasurements = {
  foot_length_mm: number;
  // Derived server-side from width_ratio × foot_length_mm; null when the model
  // could not read a usable width.
  foot_width_mm: number | null;
  // width / length, read from the top-down photo. Scale-free, so it survives an
  // imprecise length anchor — it's the backbone of the width classification.
  width_ratio: number | null;
};

export type FootTraits = {
  width: WidthClass;
  instep: InstepClass;
  toe_shape: ToeShape;
};

export type FootConfidence = {
  width: Confidence;
  instep: Confidence;
  toe_shape: Confidence;
};

// One foot's full read-out.
export type FootReport = {
  side: FootSide;
  measurements: FootMeasurements;
  traits: FootTraits;
  confidence: FootConfidence;
};

// Left/right comparison, present only when both feet were captured.
export type Asymmetry = {
  length_diff_mm: number;
  width_diff_mm: number;
  // The foot we recommend sizing to (the larger one).
  larger: FootSide;
};

export type RetakeRequest = { view: ViewId; reason: string };

// The complete analysis result returned by the API and stored in history.
export type FootScanResult = {
  primary: FootReport;
  other: { side: FootSide; measurements: FootMeasurements } | null;
  asymmetry: Asymmetry | null;
  // Plain-language explanation, in the caller's language.
  summary: string;
  // Disclaimers / "indicative, not medical" notes.
  cautions: string[];
  // When the model judged a view unusable, the client re-shoots just that view.
  needs_retake: RetakeRequest[];
};

// The compact "foot profile" we persist on the profile + hand to the AI picker.
// A subset of the result: just the actionable traits + a couple of numbers.
export type FootProfile = {
  foot_width: WidthClass;
  instep: InstepClass;
  toe_shape: ToeShape;
  foot_length_mm: number;
  foot_width_mm: number | null;
  // ISO timestamp of the scan it came from.
  scanned_at: string;
};

// ---- English label maps (run through translate() at the call site) ----

export const WIDTH_LABEL: Record<WidthClass, string> = {
  narrow: "Narrow",
  standard: "Standard",
  wide: "Wide",
  extra_wide: "Extra wide"
};

export const INSTEP_LABEL: Record<InstepClass, string> = {
  low: "Low instep",
  normal: "Normal instep",
  high: "High instep"
};

export const TOE_LABEL: Record<ToeShape, string> = {
  egyptian: "Egyptian (big toe longest)",
  greek: "Greek (second toe longest)",
  roman: "Roman (first three even)",
  square: "Square (toes even)"
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence"
};

export const SIDE_LABEL: Record<FootSide, string> = {
  left: "Left foot",
  right: "Right foot"
};

// Position of each width class on a 0..1 scale, for the result bar.
export const WIDTH_SCALE: Record<WidthClass, number> = {
  narrow: 0.12,
  standard: 0.4,
  wide: 0.68,
  extra_wide: 0.9
};

export const INSTEP_SCALE: Record<InstepClass, number> = {
  low: 0.18,
  normal: 0.5,
  high: 0.85
};

export const WIDTH_ORDER: WidthClass[] = ["narrow", "standard", "wide", "extra_wide"];
export const INSTEP_ORDER: InstepClass[] = ["low", "normal", "high"];
export const TOE_ORDER: ToeShape[] = ["egyptian", "greek", "roman", "square"];

export function isWidthClass(v: unknown): v is WidthClass {
  return typeof v === "string" && (WIDTH_ORDER as string[]).includes(v);
}
export function isInstepClass(v: unknown): v is InstepClass {
  return typeof v === "string" && (INSTEP_ORDER as string[]).includes(v);
}
export function isToeShape(v: unknown): v is ToeShape {
  return typeof v === "string" && (TOE_ORDER as string[]).includes(v);
}
export function isConfidence(v: unknown): v is Confidence {
  return v === "low" || v === "medium" || v === "high";
}

export function isFootProfile(value: unknown): value is FootProfile {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<FootProfile>;
  return (
    isWidthClass(v.foot_width) &&
    isInstepClass(v.instep) &&
    isToeShape(v.toe_shape) &&
    typeof v.foot_length_mm === "number"
  );
}
