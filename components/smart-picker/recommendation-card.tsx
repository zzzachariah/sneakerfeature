"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { PerformanceRadar } from "@/components/detail/performance-radar";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRating } from "@/components/shoe/star-rating";
import type { RecommendationItem } from "@/lib/ai/types";

type Props = {
  rec: RecommendationItem;
  rank: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
};

export function RecommendationCard({ rec, rank, selected, disabled, onToggle }: Props) {
  const { translate } = useLocale();
  const href = `/shoes/${rec.slug}` as Route;

  return (
    <div className="surface-card premium-border overflow-hidden rounded-2xl p-3.5 transition hover:shadow-[0_10px_30px_rgb(var(--glass-shadow)/0.16)]">
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <span className="absolute -left-1 -top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--text))] px-1 text-[0.7rem] font-bold text-[rgb(var(--bg))]">
            {rank}
          </span>
          <Link href={href} target="_blank" rel="noopener noreferrer">
            <ShoeImage
              src={rec.image_url}
              alt={rec.shoe_name}
              fallbackLabel={translate("No image")}
              variant="suggestion"
              className="!mx-0"
            />
          </Link>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <Link href={href} target="_blank" rel="noopener noreferrer" className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-[-0.01em]">{rec.shoe_name}</div>
              <div className="truncate text-[0.75rem] soft-text">
                {rec.brand}
                {rec.category ? <span className="opacity-60"> · {rec.category}</span> : null}
              </div>
            </Link>
            <label
              onClick={(e) => e.stopPropagation()}
              className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-[rgb(var(--text)/0.05)] px-1.5 py-1"
              title={translate("Add to compare")}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={disabled && !selected}
                onChange={onToggle}
                className="h-3.5 w-3.5 accent-[rgb(var(--text))] disabled:opacity-40"
                aria-label={translate("Add to compare")}
              />
            </label>
          </div>

          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="text-[0.7rem] uppercase tracking-[0.12em] soft-text">{translate("Recommendation")}</span>
            <StarRating value={rec.stars} size="sm" showNumber />
          </div>

          {rec.reason && <p className="mt-2 text-[0.82rem] leading-snug">{rec.reason}</p>}
        </div>
      </div>

      {rec.radar.length > 0 && (
        <div className="mt-3 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--text)/0.015)] px-3 pb-3 pt-2.5">
          <p className="mb-1 text-center text-[0.62rem] font-semibold uppercase tracking-[0.18em] soft-text">
            {translate("Performance")}
          </p>
          <div className="mx-auto w-full max-w-[230px]">
            <PerformanceRadar axes={rec.radar} />
          </div>
        </div>
      )}

      <div className="mt-2.5 flex justify-end">
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.5)] px-2.5 py-1 text-[0.75rem] font-medium text-[rgb(var(--text))] transition hover:border-[rgb(var(--text)/0.45)]"
        >
          {translate("View details")}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
