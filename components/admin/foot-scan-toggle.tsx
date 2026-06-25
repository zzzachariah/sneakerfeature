"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = { initialEnabled: boolean };

export function FootScanToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setEnabled(initialEnabled), [initialEnabled]);

  const toggle = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = !enabled;
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ footScanPublic: next })
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.message ?? "Failed to update setting.");
      } else {
        setEnabled(json.settings.footScanPublic);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }, [enabled, busy]);

  return (
    <div className="rounded-xl border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.55)] p-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Foot Scan — public access</p>
          <p className="mt-1 text-xs soft-text">
            When ON, every logged-in user can open the hidden Foot Scan tool (/foot-scan).
            When OFF, only admins can use it (regular users see the &ldquo;Under development&rdquo; placeholder).
            There is no homepage link either way.
          </p>
          <p className="mt-2 text-xs">
            Current status:{" "}
            <span className={enabled ? "font-semibold text-emerald-600 dark:text-emerald-400" : "font-semibold text-amber-600 dark:text-amber-400"}>
              {enabled ? "ON — open to all users" : "OFF — admins only"}
            </span>
          </p>
        </div>
        <Button onClick={toggle} disabled={busy} variant={enabled ? "secondary" : "primary"}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? "Disable for non-admins" : "Enable for all users"}
        </Button>
      </div>
      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
    </div>
  );
}
