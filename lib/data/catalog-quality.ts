import type { ShoeSpec } from "@/lib/types";
import { DIM_KEYS, hasPerformanceEvidence } from "@/lib/star-rating";

export type SpecVersion = ShoeSpec & { id?: string; updated_at?: string; created_at?: string };
export type QualityIssue = "duplicate_specs" | "conflicting_versions" | "ventilation_conflict" | "missing_performance";

function timestamp(row: SpecVersion) {
  const value = Date.parse(row.updated_at ?? row.created_at ?? "");
  return Number.isFinite(value) ? value : 0;
}
function completeness(row: SpecVersion) {
  return Object.values(row).filter(value => typeof value === "string" && value.trim()).length;
}

// Deterministic even when PostgREST returns related rows in a different order.
// Never merge technical facts from different versions or delete history.
export function selectSpecVersion(versions: SpecVersion[] | null | undefined): SpecVersion {
  return [...(versions ?? [])].sort((a, b) => timestamp(b) - timestamp(a) ||
    completeness(b) - completeness(a) || (b.created_at ?? "").localeCompare(a.created_at ?? "") ||
    (a.id ?? "").localeCompare(b.id ?? ""))[0] ?? {};
}

export function inspectSpecs(versions: SpecVersion[] | null | undefined): QualityIssue[] {
  const rows = versions ?? [];
  const selected = selectSpecVersion(rows);
  const issues: QualityIssue[] = [];
  if (rows.length > 1) issues.push("duplicate_specs");
  const fields = ["forefoot_midsole_tech", "heel_midsole_tech", "upper_tech", ...DIM_KEYS] as const;
  if (fields.some(key => new Set(rows.map(row => row[key]?.trim().toLowerCase()).filter(Boolean)).size > 1)) {
    issues.push("conflicting_versions");
  }
  const upper = `${selected.upper_tech ?? ""} ${selected.upper_tech_zh ?? ""}`;
  const con = `${selected.con_summary ?? ""} ${selected.con_summary_zh ?? ""}`;
  if (/(?:\bbreathable\b|透气)/i.test(upper) && !/(?:not breathable|non-breathable|不透气)/i.test(upper) &&
    /poorly ventilated|traps (?:heat|moisture)|not breathable|闷热|不透气/i.test(con)) {
    issues.push("ventilation_conflict");
  }
  if (DIM_KEYS.filter(key => hasPerformanceEvidence(selected[key])).length < 3) issues.push("missing_performance");
  return issues;
}

export function publicSpec(versions: SpecVersion[] | null | undefined): ShoeSpec {
  const spec = { ...selectSpecVersion(versions) };
  delete spec.id;
  delete spec.updated_at;
  delete spec.created_at;
  if (inspectSpecs(versions).includes("ventilation_conflict")) {
    // Keep the original editorial content in the database for review, but do
    // not present its contradiction as an actionable buying recommendation.
    spec.pro_summary = spec.pro_summary_zh = spec.con_summary = spec.con_summary_zh = null;
    spec.upper_tech = spec.upper_tech_zh = null;
  }
  return spec;
}

export function displayBrand(brand: string): string {
  return /^(?:361掳|361Â°|361°|361 degrees)$/i.test(brand.trim()) ? "361°" : brand.trim();
}

export function safeSourceUrl(value: string | null | undefined): string | null {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" || url.protocol === "http:" ? url.href : null; }
  catch { return null; }
}
