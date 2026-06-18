// Turns "the brand + size of a shoe that fits me best" into an approximate foot
// length (mm) — the scale anchor for the scan. No physical reference object
// needed (per product decision).
//
// Accuracy note: shoe-size → foot-length carries brand/last variance
// (~±6-10mm). That's acceptable here because the WIDTH read is driven by the
// scale-free width/length ratio from the photo; the length anchor mainly sets
// the displayed millimetres and which width band we index. Users who know their
// measured foot length can enter it directly for a tighter anchor.

export type FitFeel = "snug" | "perfect" | "roomy";

export type SizeSystem =
  | "us_men" // US men's sizing (most basketball shoes)
  | "eu" // European sizing
  | "cn_mm" // Chinese sizing where the number is the foot length in mm
  | "foot_cm"; // user enters measured foot length directly

export const SIZE_SYSTEM_LABEL: Record<SizeSystem, string> = {
  us_men: "US (men's)",
  eu: "EU",
  cn_mm: "CN (mm)",
  foot_cm: "Foot length (cm)"
};

export type BrandOption = {
  id: string;
  label: string;
  system: SizeSystem;
  // Per-brand nudge (mm) applied on top of the base table — small, indicative.
  offsetMm?: number;
};

// Brands carried by the catalog, grouped by their native sizing system.
export const BRANDS: BrandOption[] = [
  { id: "nike", label: "Nike", system: "us_men" },
  { id: "jordan", label: "Jordan", system: "us_men", offsetMm: -2 },
  { id: "adidas", label: "adidas", system: "us_men", offsetMm: 2 },
  { id: "under_armour", label: "Under Armour", system: "us_men" },
  { id: "puma", label: "PUMA", system: "us_men" },
  { id: "new_balance", label: "New Balance", system: "us_men" },
  { id: "li_ning", label: "Li-Ning (李宁)", system: "cn_mm" },
  { id: "anta", label: "Anta (安踏)", system: "cn_mm" },
  { id: "361", label: "361°", system: "cn_mm" },
  { id: "peak", label: "Peak (匹克)", system: "cn_mm" },
  { id: "other", label: "Other / not sure", system: "us_men" },
  { id: "measured", label: "I'll enter my foot length", system: "foot_cm" }
];

export function getBrand(id: string): BrandOption | undefined {
  return BRANDS.find((b) => b.id === id);
}

// US men's size → foot length (mm). Clean ~5mm-per-half-size table; close enough
// for an indicative anchor and easy to reason about.
const US_MEN_MM: Record<string, number> = {
  "6": 240,
  "6.5": 245,
  "7": 250,
  "7.5": 255,
  "8": 260,
  "8.5": 265,
  "9": 270,
  "9.5": 275,
  "10": 280,
  "10.5": 285,
  "11": 290,
  "11.5": 295,
  "12": 300,
  "12.5": 305,
  "13": 310,
  "13.5": 315,
  "14": 320,
  "15": 330
};

// EU size → foot length (mm). ~6.67mm per EU size, anchored at EU 40 ≈ 250mm.
function euToMm(eu: number): number {
  return Math.round(250 + (eu - 40) * (200 / 30));
}

export function sizeOptions(system: SizeSystem): string[] {
  if (system === "us_men") return Object.keys(US_MEN_MM);
  if (system === "eu") {
    const out: string[] = [];
    for (let eu = 35; eu <= 50; eu += 0.5) out.push(eu % 1 === 0 ? String(eu) : eu.toFixed(1));
    return out;
  }
  if (system === "cn_mm") {
    const out: string[] = [];
    for (let mm = 230; mm <= 320; mm += 5) out.push(String(mm));
    return out;
  }
  // foot_cm: free numeric input, no preset list.
  return [];
}

// Which sizing systems a brand can be entered in (always offers EU as a common
// alternative for non-measured brands).
export function systemsForBrand(brand: BrandOption): SizeSystem[] {
  if (brand.system === "foot_cm") return ["foot_cm"];
  if (brand.system === "cn_mm") return ["cn_mm", "eu"];
  return ["us_men", "eu"];
}

const FIT_ADJUST_MM: Record<FitFeel, number> = {
  // A snug-fitting shoe means the foot is at the larger end of that size.
  snug: 3,
  perfect: 0,
  roomy: -3
};

// Resolve a selection to foot length in mm, or null if it can't. `system`
// overrides the brand's native system (e.g. entering an EU size for Nike).
export function footLengthMm(input: {
  brandId: string;
  size: string; // size token for the chosen system, OR foot length in cm
  fit?: FitFeel;
  system?: SizeSystem;
}): number | null {
  const brand = getBrand(input.brandId);
  if (!brand) return null;
  const system = input.system ?? brand.system;
  const offset = brand.offsetMm ?? 0;

  if (system === "foot_cm") {
    const cm = Number(input.size);
    if (!Number.isFinite(cm) || cm < 18 || cm > 36) return null;
    // A directly measured length needs no fit nudge.
    return Math.round(cm * 10) + offset;
  }

  let base: number | null = null;
  if (system === "us_men") {
    base = US_MEN_MM[input.size] ?? null;
  } else if (system === "eu") {
    const eu = Number(input.size);
    base = Number.isFinite(eu) ? euToMm(eu) : null;
  } else if (system === "cn_mm") {
    const mm = Number(input.size);
    base = Number.isFinite(mm) ? mm : null;
  }
  if (base === null) return null;

  const fitAdj = input.fit ? FIT_ADJUST_MM[input.fit] : 0;
  return base + offset + fitAdj;
}
