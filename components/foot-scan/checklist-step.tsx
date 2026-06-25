"use client";

// Pre-capture checklist — nudges the conditions that most affect accuracy before
// the camera opens, so we waste fewer shots on bad inputs.

import { useState } from "react";
import { Footprints, Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";

const ITEMS = [
  "Barefoot, or thin socks (thick socks affect accuracy)",
  "The floor is a plain colour that contrasts with my foot",
  "Lighting is even — no strong shadows or backlight",
  "The area around my foot is clear"
];

export function ChecklistStep({
  onReady,
  depthSupported,
  onChooseDepthBeta
}: {
  onReady: () => void;
  // Whether the device has a usable depth sensor (LiDAR/ToF/ARCore). Gates the
  // Beta high-precision option; false → "Beta unavailable".
  depthSupported: boolean;
  onChooseDepthBeta: () => void;
}) {
  const { translate } = useLocale();
  const [checked, setChecked] = useState<boolean[]>(ITEMS.map(() => false));
  const allChecked = checked.every(Boolean);

  function toggle(i: number) {
    setChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)]">
          <Footprints className="h-6 w-6 text-[rgb(var(--text))]" />
        </span>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">{translate("Before you start")}</h2>
        <p className="text-sm soft-text">{translate("Takes about a minute. Check each item to continue.")}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {ITEMS.map((item, i) => (
          <li key={i}>
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.4)] bg-[rgb(var(--surface)/0.5)] p-3 transition-colors hover:bg-[rgb(var(--surface)/0.7)] active:bg-[rgb(var(--surface)/0.9)] focus-within:ring-2 focus-within:ring-[rgb(var(--text)/0.2)]">
              <input
                type="checkbox"
                checked={checked[i]}
                onChange={() => toggle(i)}
                className="h-5 w-5 shrink-0 accent-[rgb(var(--text))]"
              />
              <span className="text-sm">{translate(item)}</span>
            </label>
          </li>
        ))}
      </ul>

      <Button variant="primary" disabled={!allChecked} onClick={onReady}>
        {translate("Start scanning")}
      </Button>

      {/* Beta high-precision (depth) entry — gated by device capability. */}
      <div className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.4)] bg-[rgb(var(--surface)/0.4)] p-3">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="h-3.5 w-3.5" />
          {translate("High-precision scan")}
          <span className="rounded bg-[rgb(var(--text)/0.1)] px-1.5 py-0.5 text-[0.67rem] uppercase tracking-wide">Beta</span>
        </p>
        <p className="mt-0.5 text-xs soft-text">
          {translate("Uses your phone's depth sensor (LiDAR/ToF) for millimetre measurements.")}
        </p>
        {depthSupported ? (
          <Button variant="secondary" className="mt-2 w-full" onClick={onChooseDepthBeta}>
            {translate("Try high-precision scan (Beta)")}
          </Button>
        ) : (
          <p className="mt-2 text-xs text-[rgb(var(--subtext))]">
            {translate("Beta unavailable — this device has no supported depth sensor.")}
          </p>
        )}
      </div>
    </div>
  );
}
