"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Check, Minus } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
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
    <div className="surface-card premium-border rounded-2xl p-3">
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <span className="absolute -left-1 -top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--text))] px-1 text-[0.7rem] font-bold text-[rgb(var(--bg))]">
            {rank}
          </span>
          <Link href={href}>
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
            <Link href={href} className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-[-0.01em]">{rec.shoe_name}</div>
              <div className="truncate text-[0.75rem] soft-text">{rec.brand}</div>
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

          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[0.7rem] soft-text">{translate("Recommendation")}</span>
            <StarRating value={rec.stars} size="sm" showNumber />
          </div>

          {rec.summary && <p className="mt-1.5 text-[0.82rem] leading-snug">{rec.summary}</p>}
        </div>
      </div>

      {(rec.pros.length > 0 || rec.cons.length > 0) && (
        <div className="mt-2.5 grid gap-1.5 sm:grid-cols-2">
          {rec.pros.length > 0 && (
            <ul className="space-y-1">
              {rec.pros.map((p, i) => (
                <li key={`p-${i}`} className="flex items-start gap-1.5 text-[0.78rem] leading-snug">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--success))]" />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
          {rec.cons.length > 0 && (
            <ul className="space-y-1">
              {rec.cons.map((c, i) => (
                <li key={`c-${i}`} className="flex items-start gap-1.5 text-[0.78rem] leading-snug soft-text">
                  <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--subtext))]" />
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mt-2.5 border-t border-[rgb(var(--glass-stroke-soft)/0.4)] pt-2">
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-[0.75rem] font-medium text-[rgb(var(--text))] hover:underline"
        >
          {translate("View details")}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
