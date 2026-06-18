"use client";

// Step 1: derive the foot-length anchor from a shoe the user already owns — pick
// the brand + the best-fitting size + how it fits. No ruler or reference object.

import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { FootSide } from "@/lib/foot-scan/types";
import {
  BRANDS,
  footLengthMm,
  getBrand,
  sizeOptions,
  systemsForBrand,
  SIZE_SYSTEM_LABEL,
  type FitFeel,
  type SizeSystem
} from "@/lib/foot-scan/size-chart";

export type SizeChoice = {
  footLengthMm: number;
  primarySide: FootSide;
  captureBoth: boolean;
};

const FITS: { id: FitFeel; label: string }[] = [
  { id: "snug", label: "Snug" },
  { id: "perfect", label: "Just right" },
  { id: "roomy", label: "Roomy" }
];

export function SizeStep({ onSubmit }: { onSubmit: (choice: SizeChoice) => void }) {
  const { translate } = useLocale();
  const [brandId, setBrandId] = useState("nike");
  const [system, setSystem] = useState<SizeSystem>("us_men");
  const [size, setSize] = useState("");
  const [cm, setCm] = useState("");
  const [fit, setFit] = useState<FitFeel>("perfect");
  const [primarySide, setPrimarySide] = useState<FootSide>("right");
  const [captureBoth, setCaptureBoth] = useState(true);

  const brand = getBrand(brandId);
  const systems = useMemo(() => (brand ? systemsForBrand(brand) : ["us_men" as SizeSystem]), [brand]);
  const options = useMemo(() => sizeOptions(system), [system]);

  function changeBrand(id: string) {
    setBrandId(id);
    const b = getBrand(id);
    setSystem(b ? systemsForBrand(b)[0] : "us_men");
    setSize("");
  }

  const resolvedLength = useMemo(() => {
    if (system === "foot_cm") return footLengthMm({ brandId, size: cm, system });
    return footLengthMm({ brandId, size, fit, system });
  }, [brandId, size, cm, fit, system]);

  function handleContinue() {
    if (resolvedLength === null) return;
    onSubmit({ footLengthMm: resolvedLength, primarySide, captureBoth });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{translate("Set your size")}</h2>
        <p className="mt-1 text-sm soft-text">
          {translate("Pick a shoe that fits you well — we use it to estimate your foot length.")}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{translate("Brand")}</span>
        <Select value={brandId} onChange={(e) => changeBrand(e.target.value)}>
          {BRANDS.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </Select>
      </label>

      {systems.length > 1 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{translate("Size system")}</span>
          <div className="grid grid-cols-2 gap-2">
            {systems.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setSystem(s);
                  setSize("");
                }}
                className={`min-h-[44px] rounded-lg border px-2 text-sm transition md:min-h-[36px] ${
                  system === s
                    ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] font-semibold text-[rgb(var(--bg))]"
                    : "border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-[rgb(var(--text))]"
                }`}
              >
                {translate(SIZE_SYSTEM_LABEL[s])}
              </button>
            ))}
          </div>
        </div>
      )}

      {system === "foot_cm" ? (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{translate("Foot length (cm)")}</span>
          <Input
            type="number"
            inputMode="decimal"
            min={18}
            max={36}
            step={0.1}
            placeholder="26.5"
            value={cm}
            onChange={(e) => setCm(e.target.value)}
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            {translate("Size")} ({translate(SIZE_SYSTEM_LABEL[system])})
          </span>
          <Select value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">{translate("Select…")}</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </label>
      )}

      {system !== "foot_cm" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{translate("How does it fit?")}</span>
          <div className="grid grid-cols-3 gap-2">
            {FITS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFit(f.id)}
                className={`min-h-[44px] rounded-lg border px-2 text-sm transition md:min-h-[36px] ${
                  fit === f.id
                    ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] font-semibold text-[rgb(var(--bg))]"
                    : "border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-[rgb(var(--text))]"
                }`}
              >
                {translate(f.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{translate("Which foot will you scan first?")}</span>
        <div className="grid grid-cols-2 gap-2">
          {(["right", "left"] as FootSide[]).map((s) => (
            <button
              key={s}
              onClick={() => setPrimarySide(s)}
              className={`min-h-[44px] rounded-lg border px-2 text-sm transition md:min-h-[36px] ${
                primarySide === s
                  ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] font-semibold text-[rgb(var(--bg))]"
                  : "border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] text-[rgb(var(--text))]"
              }`}
            >
              {translate(s === "right" ? "Right foot" : "Left foot")}
            </button>
          ))}
        </div>
      </div>

      <label className="flex items-center justify-between gap-3 rounded-xl bg-[rgb(var(--text)/0.04)] p-3">
        <span className="text-sm">
          {translate("Scan both feet")}
          <span className="block text-xs soft-text">{translate("Adds one photo — reports left/right difference")}</span>
        </span>
        <input
          type="checkbox"
          checked={captureBoth}
          onChange={(e) => setCaptureBoth(e.target.checked)}
          className="h-5 w-5 accent-[rgb(var(--text))]"
        />
      </label>

      {resolvedLength !== null && (
        <p className="text-xs soft-text">
          {translate("Estimated foot length")}: ~{(resolvedLength / 10).toFixed(1)} cm
        </p>
      )}

      <Button variant="primary" disabled={resolvedLength === null} onClick={handleContinue}>
        {translate("Continue")}
      </Button>
    </div>
  );
}
