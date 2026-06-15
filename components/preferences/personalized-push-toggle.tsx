"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

// Self-contained opt-out for the weekly personalized recommendation push.
// Fetches and updates its own state, so it can be dropped into the settings
// page without threading props.
export function PersonalizedPushToggle() {
  const { translate } = useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/preferences/personalized-push", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (active && d.ok) setEnabled(Boolean(d.enabled));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function toggle() {
    if (enabled === null || saving) return;
    const next = !enabled;
    setSaving(true);
    setEnabled(next); // optimistic
    try {
      const res = await fetch("/api/preferences/personalized-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next })
      });
      const data = await res.json();
      if (!data.ok) setEnabled(!next); // revert on failure
    } catch {
      setEnabled(!next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="glass glass-rim relative rounded-2xl p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] soft-text">
        {translate("Notifications")}
      </h3>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <BellRing className="h-4 w-4 text-[rgb(var(--accent))]" />
            {translate("Personalized recommendations")}
          </p>
          <p className="mt-1 text-xs soft-text">
            {translate("Get a weekly push with shoe comparisons and picks based on what you browse.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled ?? false}
          aria-label={translate("Personalized recommendations")}
          disabled={enabled === null || saving}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${
            enabled ? "bg-[rgb(var(--accent))]" : "bg-[rgb(var(--muted)/0.8)]"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
              enabled ? "left-[1.375rem]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
