"use client";

import { useEffect, useId, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { HEIGHT_MAX, HEIGHT_MIN, WEIGHT_MAX, WEIGHT_MIN } from "@/lib/persona/types";
import { inRange, usHeight, usWeight, type MeasurementField, type Measurements } from "@/lib/persona/measurements";

type Props = {
  value: Measurements;
  onChange: (field: MeasurementField, value: string) => void;
  disabled?: boolean;
  errors?: { height?: string; weight?: string };
};

const preference = "sf-profile-measurement-units";
type Units = "metric" | "us";

export function ProfileMeasurements({ value, onChange, disabled = false, errors = {} }: Props) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const id = useId();
  const [units, setUnits] = useState<Units>("metric");
  useEffect(() => {
    try { if (localStorage.getItem(preference) === "us") setUnits("us"); } catch { /* storage is optional */ }
  }, []);
  function chooseUnits(next: Units) {
    setUnits(next);
    try { localStorage.setItem(preference, next); } catch { /* keep the in-memory choice */ }
  }

  const us = units === "us";
  const height = zh ? "身高" : "Height";
  const weight = zh ? "体重" : "Body weight";
  const heightRange = us ? `${usHeight(HEIGHT_MIN)}–${usHeight(HEIGHT_MAX)}` : `${HEIGHT_MIN}–${HEIGHT_MAX} cm`;
  const weightRange = us ? `${usWeight(WEIGHT_MIN)}–${usWeight(WEIGHT_MAX)}` : `${WEIGHT_MIN}–${WEIGHT_MAX} kg`;
  const heightHint = inRange(value.cm, HEIGHT_MIN, HEIGHT_MAX) ? `≈ ${us ? value.cm + " cm" : usHeight(Number(value.cm))}` : heightRange;
  const weightHint = inRange(value.kg, WEIGHT_MIN, WEIGHT_MAX) ? `≈ ${us ? value.kg + " kg" : usWeight(Number(value.kg))}` : weightRange;

  function input(field: MeasurementField, label: string, unit: string, group: "height" | "weight") {
    return <label className="block min-w-0">
      <span className="mb-1 block text-xs font-medium">{label} ({unit})</span>
      <input type="text" name={field} inputMode={field === "feet" ? "numeric" : "decimal"} autoComplete="off"
        value={value[field]} onChange={event => onChange(field, event.target.value)} disabled={disabled}
        aria-invalid={Boolean(errors[group])} aria-describedby={`${id}-${group}-hint${errors[group] ? " " + id + "-" + group + "-error" : ""}`}
        className="h-11 w-full min-w-0 rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3 text-base tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand))] disabled:opacity-50" />
    </label>;
  }
  function hint(group: "height" | "weight", text: string) {
    return <>
      <p id={`${id}-${group}-hint`} className="mt-1 text-xs soft-text">{text}</p>
      {errors[group] && <p id={`${id}-${group}-error`} role="alert" className="mt-1 text-xs text-[rgb(var(--error))]">{errors[group]}</p>}
    </>;
  }
  return <div className="space-y-3">
    <div role="group" aria-label={zh ? "计量单位" : "Measurement units"} className="inline-flex rounded-lg border border-[rgb(var(--muted)/0.55)] p-0.5">
      {(["metric", "us"] as const).map(option => <button key={option} type="button" aria-pressed={option === units} disabled={disabled}
        onClick={() => chooseUnits(option)} className="min-h-9 rounded-md px-3 text-xs font-semibold soft-text aria-pressed:bg-[rgb(var(--text))] aria-pressed:text-[rgb(var(--bg))]">
        {option === "metric" ? "cm / kg" : "ft · in / lb"}
      </button>)}
    </div>
    <div className={`grid gap-3 ${us ? "grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" : "grid-cols-2"}`}>
      <div data-profile-field="height">
        {us ? <div className="grid grid-cols-2 gap-2">{input("feet", height, "ft", "height")}{input("inches", height, "in", "height")}</div> : input("cm", height, "cm", "height")}
        {hint("height", heightHint)}
      </div>
      <div data-profile-field="weight">
        {input(us ? "lb" : "kg", weight, us ? "lb" : "kg", "weight")}
        {hint("weight", weightHint)}
      </div>
    </div>
  </div>;
}
