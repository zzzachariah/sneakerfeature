"use client";

import { useLocale } from "@/components/i18n/locale-provider";

// Compact hero + index stats shown above the database grid. It lives inside the
// feed's scroll area, so it scrolls away (not sticky) as you browse down.
export function HomeFeedHeader({ shoesCount, brandsCount }: { shoesCount: number; brandsCount: number }) {
  const { translate } = useLocale();
  return (
    <div className="glass-lite mb-3 rounded-xl p-4">
      <p className="t-eyebrow mb-1.5">{translate("The Decision Layer for Basketball Sneakers")}</p>
      <h2 className="t-display-sm" style={{ fontSize: "clamp(1.25rem, 2.4vw, 1.75rem)", lineHeight: 1.1 }}>
        {translate("Sneaker Database")}
      </h2>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[rgb(var(--subtext))]">
        <span>
          <span className="num-display font-bold text-[rgb(var(--text))]">{shoesCount}</span> {translate("shoes indexed")}
        </span>
        <span className="text-[rgb(var(--muted)/0.9)]">·</span>
        <span>
          <span className="num-display font-bold text-[rgb(var(--text))]">{brandsCount}</span>{" "}
          {translate("brands represented")}
        </span>
        <span className="text-[rgb(var(--muted)/0.9)]">·</span>
        <span>
          <span className="font-bold text-[rgb(var(--text))]">{translate("Live")}</span> {translate("submission pipeline")}
        </span>
      </div>
    </div>
  );
}
