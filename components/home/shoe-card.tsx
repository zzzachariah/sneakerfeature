"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useMemo } from "react";
import type { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { METRICS, type MetricKey, scoreFor } from "@/components/compare/compare-metrics";
import { scoreColor } from "@/lib/score-tone";
import { FavoriteButton } from "@/components/favorites/favorite-button";
import { Reveal } from "@/components/motion/reveal";

type Props = {
  shoe: Shoe;
  matchScore?: number | null;
  showChips?: boolean;
  compareEnabled?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Extra classes on the outer <li> — e.g. fixed width for horizontal rails. */
  className?: string;
  /**
   * When provided, the card reveals (fade + rise) as it scrolls into view, with a
   * stagger derived from its position — used by grids/rails (favorites, search,
   * collections). Omit in virtualized feeds where rows mount/unmount on scroll.
   */
  index?: number;
  /** When true, loads the image eagerly to avoid lazy-loading LCP images. */
  priority?: boolean;
};

// Compact metric labels for the personalized-mode card chips (the full
// METRICS labels / dictionary entries are too long for a 2-col mobile card).
const CHIP_LABEL: Record<MetricKey, string> = {
  cushioning_feel: "Cushion",
  court_feel: "Court",
  bounce: "Bounce",
  stability: "Stable",
  traction: "Grip",
  fit: "Fit"
};

export function ShoeCard({ shoe, matchScore, showChips, compareEnabled, selected, onToggleSelect, className, index, priority }: Props) {
  const { translate } = useLocale();
  const router = useRouter();
  const href = `/shoes/${shoe.slug}` as Route;

  // Top two performance dimensions, shown only in personalized mode so default
  // browsing stays clean. Computed for the few visible cards only.
  const chips = useMemo(() => {
    if (!showChips) return [];
    return METRICS.map((m) => ({ key: m.key, score: scoreFor(shoe, m.key) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  }, [shoe, showChips]);

  const body = (
    <>
      <Link
        href={href}
        prefetch
        // Warm the detail route the moment a finger lands / pointer enters, so by
        // the time the tap completes the navigation is already in flight.
        onPointerEnter={() => router.prefetch(href)}
        className="glass-lite block overflow-hidden rounded-2xl transition duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[rgb(var(--text)/0.25)] hover:bg-[rgb(var(--text)/0.04)] active:scale-[0.985] active:bg-[rgb(var(--text)/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]"
      >
        <div className="shoe-stage relative aspect-square w-full">
          <ShoeImage
            src={shoe.image_url}
            alt={shoe.shoe_name}
            fallbackLabel={translate("No image")}
            variant="detail"
            interactive
            priority={priority ?? index === 0}
            className="!w-full !max-w-none !rounded-none !border-0"
          />
          {matchScore != null && (
            <span className="pop-in absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-amber-400/95 px-2 py-0.5 text-[0.7rem] font-bold text-black shadow-[0_2px_8px_rgb(var(--shadow)/0.25)]">
              <span className="num-display">{matchScore}%</span> {translate("match")}
            </span>
          )}
        </div>
        <div className="p-3">
          <div className="truncate text-sm font-semibold tracking-[-0.01em] leading-[1.25]">{shoe.shoe_name}</div>
          <div className="mt-0.5 truncate text-[0.78rem] soft-text leading-snug">{shoe.brand}</div>
          <div className="mt-1.5">
            <StarRatingSlot
              value={shoe.finalStars ?? null}
              size="sm"
              showNumber
              count={shoe.userRatingCount ?? 0}
            />
          </div>
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chips.map((c) => (
                <span
                  key={c.key}
                  className="num-display inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium leading-none"
                  style={{ color: scoreColor(c.score), background: scoreColor(c.score, 0.12) }}
                >
                  {translate(CHIP_LABEL[c.key])} {c.score}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>

      {compareEnabled ? (
        <label
          onClick={(e) => e.stopPropagation()}
          className="tap-44 glass-lite absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full"
        >
          <input
            type="checkbox"
            checked={!!selected}
            onChange={(e) => {
              e.stopPropagation();
              onToggleSelect?.();
            }}
            className="h-4 w-4 accent-[rgb(var(--text))]"
            aria-label={translate("Compare")}
          />
        </label>
      ) : (
        <FavoriteButton
          shoeId={shoe.id}
          className="tap-44 glass-lite absolute bottom-2 right-2 h-7 w-7 rounded-full opacity-90"
          iconClassName="h-3.5 w-3.5"
        />
      )}

    </>
  );

  const outerClass = `group relative ${className ?? ""}`;
  if (index != null) {
    return (
      <Reveal as="li" index={index} className={outerClass}>
        {body}
      </Reveal>
    );
  }
  return <li className={outerClass}>{body}</li>;
}
