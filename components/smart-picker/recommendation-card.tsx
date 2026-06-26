"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { PerformanceRadar } from "@/components/detail/performance-radar";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRating } from "@/components/shoe/star-rating";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { RecommendationItem } from "@/lib/ai/types";

type Props = {
  rec: RecommendationItem;
  rank: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  className?: string;
};

function ProsCons({ label, items, tone }: { label: string; items: string[]; tone: "pro" | "con" }) {
  const dot = tone === "pro" ? "bg-[rgb(var(--success))]" : "bg-[rgb(var(--error))]";
  const labelColor = tone === "pro" ? "text-[rgb(var(--success))]" : "text-[rgb(var(--error))]";
  return (
    <section className="min-w-0 flex-1">
      <p className={`mb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.12em] ${labelColor}`}>{label}</p>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5 text-[0.82rem] leading-snug">
            <span className={`mt-[0.5em] h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecommendationCard({ rec, rank, selected, disabled, onToggle, className }: Props) {
  const { translate } = useLocale();
  const [detailOpen, setDetailOpen] = useState(false);
  const href = `/shoes/${rec.slug}` as Route;
  const hasProsCons = rec.pros.length > 0 || rec.cons.length > 0;

  return (
    <>
      {/* Compact card */}
      <div
        className={`surface-card premium-border flex flex-col overflow-hidden rounded-2xl transition hover:shadow-[0_8px_24px_rgb(var(--glass-shadow)/0.14)] ${className ?? ""}`}
      >
        {/* Top row: image + info */}
        <div className="flex gap-3 p-3.5">
          <div className="relative shrink-0">
            <span className="num-display absolute -left-1 -top-1 z-10 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgb(var(--text))] px-1 text-[0.7rem] font-bold text-[rgb(var(--bg))]">
              {rank}
            </span>
            <ShoeImage
              src={rec.image_url}
              alt={rec.shoe_name}
              fallbackLabel={translate("No image")}
              variant="suggestion"
              className="!mx-0"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="line-clamp-2 min-h-[2.5em] text-sm font-semibold leading-[1.25] tracking-[-0.01em]">
                  {rec.shoe_name}
                </div>
                <div className="truncate text-[0.75rem] soft-text">
                  {rec.brand}
                  {rec.category ? <span className="opacity-60"> · {rec.category}</span> : null}
                </div>
              </div>
              <label
                onClick={(e) => e.stopPropagation()}
                className="relative tap-44 inline-flex shrink-0 cursor-pointer items-center rounded-md bg-[rgb(var(--text)/0.05)] px-1.5 py-1"
                title={translate("Add to compare")}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={disabled && !selected}
                  onChange={onToggle}
                  className="h-3.5 w-3.5 accent-[rgb(var(--text))] disabled:opacity-50"
                  aria-label={translate("Add to compare")}
                />
              </label>
            </div>

            <div className="mt-1.5">
              <StarRating value={rec.stars} size="sm" />
            </div>
          </div>
        </div>

        {/* Reason + detail button */}
        <div className="flex items-center gap-2 border-t border-[rgb(var(--glass-stroke-soft)/0.3)] px-3.5 py-2.5">
          {rec.reason ? (
            <p className="min-w-0 flex-1 truncate text-[0.78rem] soft-text">{rec.reason}</p>
          ) : (
            <span className="flex-1" />
          )}
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.5)] px-2.5 py-1 text-[0.75rem] font-medium transition hover:border-[rgb(var(--text)/0.4)] hover:bg-[rgb(var(--text)/0.04)]"
          >
            {translate("Details")}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Detail bottom sheet */}
      <BottomSheet open={detailOpen} onClose={() => setDetailOpen(false)} title={rec.shoe_name}>
        <div className="space-y-4 pb-2">
          {/* Hero image + quick info */}
          <div className="flex items-center gap-4">
            <ShoeImage
              src={rec.image_url}
              alt={rec.shoe_name}
              fallbackLabel={translate("No image")}
              variant="suggestion"
              className="!mx-0 shrink-0"
            />
            <div className="min-w-0">
              <p className="text-[0.8rem] soft-text">
                {rec.brand}
                {rec.category ? <span> · {rec.category}</span> : null}
              </p>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[0.72rem] uppercase tracking-[0.12em] soft-text">
                  {translate("Recommendation")}
                </span>
                <StarRating value={rec.stars} size="sm" />
              </div>
              <Link
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-0.5 text-[0.8rem] font-medium underline-offset-2 hover:underline"
              >
                {translate("View details")}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Full reason */}
          {rec.reason && (
            <p className="text-sm leading-relaxed">{rec.reason}</p>
          )}

          {/* Pros & Cons — side by side */}
          {hasProsCons && (
            <div className="flex gap-4 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--text)/0.015)] p-3">
              {rec.pros.length > 0 && <ProsCons label={translate("Pros")} items={rec.pros} tone="pro" />}
              {rec.cons.length > 0 && <ProsCons label={translate("Cons")} items={rec.cons} tone="con" />}
            </div>
          )}

          {/* Radar chart */}
          {rec.radar.length > 0 && (
            <div className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--text)/0.015)] px-3 py-3">
              <p className="mb-2 text-center text-[0.66rem] font-semibold uppercase tracking-[0.12em] soft-text">
                {translate("Performance")}
              </p>
              <div className="mx-auto w-full max-w-[240px]">
                <PerformanceRadar axes={rec.radar} />
              </div>
            </div>
          )}

          {/* References */}
          {rec.references && rec.references.length > 0 && (
            <div className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--text)/0.015)] px-3 py-2.5">
              <p className="mb-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.12em] soft-text">
                {translate("References")}
              </p>
              <ul className="space-y-1.5">
                {rec.references.map((ref, i) => (
                  <li key={i} className="flex gap-1.5 text-[0.74rem] leading-snug">
                    <span className="num-display shrink-0 soft-text">[{i + 1}]</span>
                    <a
                      href={ref.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 truncate text-[rgb(var(--text))] underline-offset-2 hover:underline"
                      title={ref.url}
                    >
                      {ref.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
