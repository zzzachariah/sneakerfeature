"use client";

import { useEffect, useState } from "react";
import { Vibrate } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics, isHapticsEnabled, setHapticsEnabled } from "@/lib/native/haptics";

// Per-device haptics opt-out (stored in localStorage, default on). Only rendered
// inside the native app, where haptics actually fire — on the web there is
// nothing to toggle. Mirrors PersonalizedPushToggle so it slots straight into the
// settings page next to it.
export function HapticsToggle() {
  const { translate } = useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [isNative, setIsNative] = useState(false);

  useEffect(() => {
    setIsNative(Capacitor.isNativePlatform());
    setEnabled(isHapticsEnabled());
  }, []);

  if (!isNative || enabled === null) return null;

  function toggle() {
    const next = !enabled;
    setEnabled(next);
    setHapticsEnabled(next);
    if (next) haptics.selection(); // let them feel it switch back on
  }

  return (
    <section className="glass glass-rim relative rounded-2xl p-5">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] soft-text">
        {translate("Haptics")}
      </h3>
      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium">
            <Vibrate className="h-4 w-4 text-[rgb(var(--accent))]" />
            {translate("Haptic feedback")}
          </p>
          <p className="mt-1 text-xs soft-text">
            {translate("Feel a subtle tap on buttons, switches, and key moments.")}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={translate("Haptic feedback")}
          onClick={toggle}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${
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
