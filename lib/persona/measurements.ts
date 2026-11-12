import { HEIGHT_MAX, HEIGHT_MIN, WEIGHT_MAX, WEIGHT_MIN } from "./types";

const CM_PER_INCH = 2.54;
const KG_PER_POUND = 0.45359237;
const tenth = (value: number) => Math.round(value * 10) / 10;

function feetAndInches(cm: number) {
  // Work in whole tenths first so the inches field never rounds up to 12.
  const tenths = Math.round(cm / CM_PER_INCH * 10);
  return { feet: String(Math.floor(tenths / 120)), inches: String(tenths % 120 / 10) };
}

export function usHeight(cm: number) {
  const { feet, inches } = feetAndInches(cm);
  return `${feet}′ ${inches}″`;
}

export function usWeight(kg: number) {
  return `${tenth(kg / KG_PER_POUND)} lb`;
}

export function formatBuild(cm: number, kg: number) {
  return `${tenth(cm)} cm (${usHeight(cm)}) · ${tenth(kg)} kg (${usWeight(kg)})`;
}

export function footDimension(mm: number) {
  return `${(mm / 10).toFixed(1)} cm (${(mm / 10 / CM_PER_INCH).toFixed(1)} in)`;
}

export function measurementDraft(cm?: number, kg?: number) {
  return {
    cm: cm === undefined ? "" : String(cm),
    ...(cm === undefined ? { feet: "", inches: "" } : feetAndInches(cm)),
    kg: kg === undefined ? "" : String(kg),
    lb: kg === undefined ? "" : String(tenth(kg / KG_PER_POUND))
  };
}

export type Measurements = ReturnType<typeof measurementDraft>;
export type MeasurementField = keyof Measurements;

function decimal(text: string) {
  return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text) ? Number(text) : NaN;
}

export function inRange(text: string, min: number, max: number) {
  const n = decimal(text);
  return n >= min && n <= max;
}

function toMetric(value: number, factor: number, min: number, max: number) {
  if (!Number.isFinite(value)) return "";
  // A boundary shown to the nearest tenth in US units must be enterable.
  if (value === tenth(min / factor)) return String(min);
  if (value === tenth(max / factor)) return String(max);
  return String(Math.round(value * factor * 100) / 100);
}

export function editMeasurement(draft: Measurements, field: MeasurementField, value: string): Measurements {
  const next = { ...draft, [field]: value };
  if (field === "cm") {
    Object.assign(next, inRange(value, HEIGHT_MIN, HEIGHT_MAX) ? feetAndInches(Number(value)) : { feet: "", inches: "" });
  } else if (field === "kg") {
    next.lb = inRange(value, WEIGHT_MIN, WEIGHT_MAX) ? String(tenth(Number(value) / KG_PER_POUND)) : "";
  } else if (field === "lb") {
    next.kg = toMetric(decimal(value), KG_PER_POUND, WEIGHT_MIN, WEIGHT_MAX);
  } else {
    const inches = next.inches === "" ? 0 : decimal(next.inches);
    const total = /^\d+$/.test(next.feet) && inches >= 0 && inches < 12 ? Number(next.feet) * 12 + inches : NaN;
    next.cm = toMetric(total, CM_PER_INCH, HEIGHT_MIN, HEIGHT_MAX);
  }
  return next;
}
