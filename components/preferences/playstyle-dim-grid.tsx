"use client";

import { Anchor, Cloud, Footprints, Hand, Magnet, Zap } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { DIM_KEYS, DIM_LABELS, type DimKey } from "@/lib/star-rating";

const DIM_ICON: Record<DimKey, typeof Cloud> = {
  cushioning_feel: Cloud,
  court_feel: Footprints,
  bounce: Zap,
  stability: Anchor,
  traction: Magnet,
  fit: Hand
};

/**
 * The single playstyle-dimension picker, shared by the player-profile modal and
 * the rating-focus modal. The same data used to be edited through two visually
 * different selectors (3-col icon grid vs 2-col text chips with degree badges);
 * this is the one canonical look: icon chips with a 1/2/3 order badge.
 * Selection order = priority order (primary → secondary → tertiary).
 */
export function PlaystyleDimGrid({
  picks,
  onToggle,
  disabled = false
}: {
  picks: DimKey[];
  onToggle: (key: DimKey) => void;
  disabled?: boolean;
}) {
  const { translate } = useLocale();
  return (
    <div className="grid grid-cols-3 gap-2">
      {DIM_KEYS.map((key) => {
        const order = picks.indexOf(key) + 1; // 0 → not picked
        const isPicked = order > 0;
        const Icon = DIM_ICON[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => {
              haptics.selection();
              onToggle(key);
            }}
            disabled={disabled}
            aria-pressed={isPicked}
            className={`relative flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2.5 text-center transition disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)] ${
              isPicked
                ? "border-[rgb(var(--brand)/0.6)] bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--text))]"
                : "border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.4)] soft-text hover:border-[rgb(var(--text)/0.4)]"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="text-[0.74rem] font-medium leading-tight">{translate(DIM_LABELS[key])}</span>
            {isPicked && (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--brand))] px-1 text-[0.6rem] font-bold text-[rgb(var(--brand-contrast))]">
                {order}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
