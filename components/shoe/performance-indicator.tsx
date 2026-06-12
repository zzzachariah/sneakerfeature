"use client";

import { getPerformanceLabel } from "@/lib/shoe-scoring";
import { useLocale } from "@/components/i18n/locale-provider";

type PerformanceIndicatorProps = {
  label: string;
  score: number;
  tier?: string;
  rawText?: string | null;
};

function getToneClass(tier: string) {
  if (tier === "Weak" || tier === "Below Average") return "bg-[rgb(var(--subtext)/0.45)]";
  if (tier === "Decent" || tier === "Solid") return "bg-[rgb(var(--subtext)/0.7)]";
  if (tier === "Good" || tier === "Very Good") return "bg-[rgb(var(--text)/0.75)]";
  return "bg-[rgb(var(--text))]";
}

export function PerformanceIndicator({ label, score, tier, rawText }: PerformanceIndicatorProps) {
  const { translate } = useLocale();
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const resolvedTier = tier ?? getPerformanceLabel(clampedScore);

  return (
    <div className="space-y-1.5 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.45)] bg-[rgb(var(--bg-elev)/0.58)] px-3 py-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <p className="uppercase tracking-[0.14em] soft-text">{translate(label)}</p>
        {rawText?.trim() ? (
          // Pre-translated upstream (stored zh / English fallback).
          <p className="truncate text-right text-[rgb(var(--text)/0.9)]">{rawText}</p>
        ) : (
          <p className="truncate text-right text-[rgb(var(--text)/0.9)]">{translate("Not yet added")}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-2 w-full overflow-hidden rounded-full bg-[rgb(var(--muted)/0.35)]">
          <div
            className={`h-full rounded-full ${getToneClass(resolvedTier)} transition-all duration-300 ease-out`}
            style={{ width: `${clampedScore}%` }}
          />
        </div>

        <span className="min-w-14 text-right text-xs soft-text">{translate(resolvedTier)}</span>
        <span className="min-w-9 text-right text-sm font-semibold text-[rgb(var(--text)/0.94)]">{clampedScore}</span>
      </div>
    </div>
  );
}
