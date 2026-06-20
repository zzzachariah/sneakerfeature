"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import type { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { METRICS, type MetricKey, scoreFor } from "@/components/compare/compare-metrics";
import { scoreColor } from "@/lib/score-tone";

type Props = {
  shoe: Shoe;
  matchScore?: number | null;
  reasons?: string[];
  showChips?: boolean;
  compareEnabled?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
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

export function ShoeCard({ shoe, matchScore, reasons, showChips, compareEnabled, selected, onToggleSelect }: Props) {
  const { translate } = useLocale();
  const router = useRouter();
  const [whyOpen, setWhyOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const href = `/shoes/${shoe.slug}` as Route;

  // Top two performance dimensions, shown only in personalized mode so default
  // browsing stays clean. Computed for the few visible cards only.
  const chips = useMemo(() => {
    if (!showChips) return [];
    return METRICS.map((m) => ({ key: m.key, score: scoreFor(shoe, m.key) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  }, [shoe, showChips]);

  useEffect(() => {
    if (!whyOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setWhyOpen(false);
    };
    window.addEventListener("mousedown", onDocClick);
    return () => window.removeEventListener("mousedown", onDocClick);
  }, [whyOpen]);

  const hasReasons = reasons && reasons.length > 0;

  return (
    <li className="group relative">
      <Link
        href={href}
        prefetch
        // Warm the detail route the moment a finger lands / pointer enters, so by
        // the time the tap completes the navigation is already in flight.
        onPointerEnter={() => router.prefetch(href)}
        className="glass-lite block overflow-hidden rounded-2xl transition duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:border-[rgb(var(--text)/0.25)] hover:bg-[rgb(var(--text)/0.04)] active:scale-[0.985] active:bg-[rgb(var(--text)/0.06)]"
      >
        <div className="relative aspect-square w-full bg-white">
          <ShoeImage
            src={shoe.image_url}
            alt={shoe.shoe_name}
            fallbackLabel={translate("No image")}
            variant="detail"
            className="!w-full !max-w-none !rounded-none !border-0"
          />
          {matchScore != null && (
            <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded-full bg-amber-400/95 px-2 py-0.5 text-[0.7rem] font-bold text-black shadow">
              {matchScore}% {translate("match")}
            </span>
          )}
          {compareEnabled && (
            <label
              onClick={(e) => e.stopPropagation()}
              className="glass-lite absolute left-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md"
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
          )}
        </div>
        <div className="p-3">
          <div className="truncate text-sm font-semibold tracking-[-0.01em]">{shoe.shoe_name}</div>
          <div className="mt-0.5 truncate text-[0.78rem] soft-text">{shoe.brand}</div>
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
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-medium leading-none tabular-nums"
                  style={{ color: scoreColor(c.score), background: scoreColor(c.score, 0.12) }}
                >
                  {translate(CHIP_LABEL[c.key])} {c.score}
                </span>
              ))}
            </div>
          )}
        </div>
      </Link>

      {hasReasons && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setWhyOpen((v) => !v);
          }}
          aria-label={translate("Why?")}
          className="glass-lite absolute bottom-3 right-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--text))] opacity-100 transition md:opacity-0 md:group-hover:opacity-100"
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      )}

      {whyOpen && hasReasons && (
        <div
          ref={popoverRef}
          className="pop-in glass glass-rim absolute bottom-12 right-3 z-10 w-[calc(100%-1.5rem)] max-w-[240px] rounded-xl p-3"
          style={{ transformOrigin: "bottom right" }}
          onClick={(e) => e.preventDefault()}
        >
          <p className="mb-1 text-[0.7rem] font-semibold uppercase tracking-[0.1em] soft-text">
            {translate("Recommended for you")}
          </p>
          <ul className="space-y-1">
            {(reasons ?? []).map((r) => (
              <li key={r} className="text-[0.78rem] leading-snug">
                · {translate(r)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
