"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, Check } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { PerformanceRadar } from "@/components/detail/performance-radar";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRating } from "@/components/shoe/star-rating";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import type { RecommendationItem } from "@/lib/ai/types";
import styles from "./recommendation-shortlist.module.css";

type Props = {
  rec: RecommendationItem;
  rank: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  className?: string;
  featured?: boolean;
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

export function RecommendationCard({ rec, rank, selected, disabled, onToggle, className, featured = false }: Props) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  const [detailOpen, setDetailOpen] = useState(false);
  const refs = rec.references ?? [];
  const href = `/shoes/${rec.slug}` as Route;
  const hasProsCons = rec.pros.length > 0 || rec.cons.length > 0;

  return (
    <>
      <article
        data-onboarding="ai-result"
        data-recommendation-rank={rank}
        className={`${styles.card} ${featured ? styles.featured : styles.compact} ${className ?? ""}`}
      >
        <div className={styles.cardHeader}>
          <span className={styles.rank}>{featured ? (zh ? "首选推荐" : "Top pick") : `${String(rank).padStart(2, "0")} · ${zh ? "备选" : "Alternative"}`}</span>
          <label className={styles.compareChoice} data-selected={selected} data-disabled={disabled && !selected}>
            <input
              type="checkbox"
              checked={selected}
              disabled={disabled && !selected}
              onChange={onToggle}
              aria-label={`${translate("Add to compare")}: ${rec.shoe_name}`}
            />
            <Check size={12} aria-hidden="true" />
            <span>{zh ? "对比" : "Compare"}</span>
          </label>
        </div>
        <div className={styles.cardBody}>
          <button type="button" className={styles.imageButton} onClick={() => setDetailOpen(true)} aria-label={`${(zh ? "详情" : "Details")}: ${rec.shoe_name}`}>
            <ShoeImage
              src={rec.image_url}
              alt={rec.shoe_name}
              fallbackLabel={translate("No image")}
              variant="closet"
              stage={false}
              className={styles.shoeImage}
            />
          </button>
          <div className={styles.cardInfo}>
            <p className={styles.brand}>{rec.brand}{rec.category ? ` · ${rec.category}` : ""}</p>
            <h3 className={styles.shoeName}>{rec.shoe_name}</h3>
            <div className={styles.rating}>
              {rec.stars == null ? <span>{translate("Not enough rating data")}</span> : <StarRating value={rec.stars} size="sm" showNumber />}
            </div>
            {rec.reason && <p className={styles.reason}>{rec.reason}</p>}
          </div>
        </div>
        <div className={styles.cardFooter}>
          <span className={styles.sourceCount}>{refs.length > 0 ? `${translate("Sources")} · ${refs.length}` : ""}</span>
          <button type="button" className={styles.detailsButton} onClick={() => setDetailOpen(true)}>
            {(zh ? "详情" : "Details")}<ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>
      </article>

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
                {rec.stars == null ? <span className="text-xs soft-text">{translate("Not enough rating data")}</span> : <StarRating value={rec.stars} size="sm" />}
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
            <div className="flex flex-col gap-4 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--text)/0.015)] p-3 sm:flex-row">
              {rec.pros.length > 0 && <ProsCons label={translate("Pros")} items={rec.pros} tone="pro" />}
              {rec.cons.length > 0 && <ProsCons label={translate("Cons")} items={rec.cons} tone="con" />}
            </div>
          )}

          {/* Radar chart */}
          {rec.radar.length > 0 && (
            <div className="rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--text)/0.015)] px-3 py-3">
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
            <div className="rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.35)] bg-[rgb(var(--text)/0.015)] px-3 py-2.5">
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
