"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Props = { initialCredits: number; maxCredits: number };

export function DailyCheckinCreditsField({ initialCredits, maxCredits }: Props) {
  const [value, setValue] = useState(String(initialCredits));
  const [savedValue, setSavedValue] = useState(initialCredits);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setValue(String(initialCredits));
    setSavedValue(initialCredits);
  }, [initialCredits]);

  const parsed = Number(value);
  const isValid = Number.isInteger(parsed) && parsed >= 0 && parsed <= maxCredits;
  const isDirty = isValid && parsed !== savedValue;

  async function save() {
    if (!isDirty || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyCheckinCredits: parsed })
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.message ?? "Failed to save.");
        return;
      }
      const next = json.settings.dailyCheckinCredits as number;
      setSavedValue(next);
      setValue(String(next));
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 4000 && !isDirty && !busy;

  return (
    <div className="rounded-xl border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.55)] p-4">
      <p className="text-sm font-semibold">Daily check-in credits</p>
      <p className="mt-1 text-xs soft-text">
        Credits each user receives once per 24h via the Smart Picker daily check-in. Set to 0 to disable claims.
      </p>
      <div className="mt-3 flex flex-col items-start gap-2 sm:flex-row sm:items-center">
        <Input
          type="number"
          min={0}
          max={maxCredits}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
          className="w-28"
          aria-label="Daily check-in credits"
        />
        <Button onClick={save} disabled={!isDirty || busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
        <span className="text-xs soft-text">credits / user / day</span>
      </div>
      {!isValid && (
        <p className="mt-2 text-xs text-amber-600">
          Enter a whole number between 0 and {maxCredits}.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      {showSaved && <p className="mt-2 text-xs text-emerald-600">Saved.</p>}
    </div>
  );
}
