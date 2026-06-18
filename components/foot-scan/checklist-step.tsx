"use client";

// Pre-capture checklist — nudges the conditions that most affect accuracy before
// the camera opens, so we waste fewer shots on bad inputs.

import { useState } from "react";
import { Footprints } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { Button } from "@/components/ui/button";

const ITEMS = [
  "I'm barefoot (no socks)",
  "The floor is a plain colour that contrasts with my skin",
  "Lighting is even — no strong shadows or backlight",
  "The area around my foot is clear"
];

export function ChecklistStep({ onReady }: { onReady: () => void }) {
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
            <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.4)] bg-[rgb(var(--surface)/0.5)] p-3">
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
    </div>
  );
}
