"use client";

import { ArrowUpRight, Check } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRating } from "@/components/shoe/star-rating";
import type { RecommendationItem } from "@/lib/ai/types";
import styles from "./recommendation-shortlist.module.css";

type Props = {
  rec: RecommendationItem;
  rank: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onOpen: () => void;
  className?: string;
  featured?: boolean;
};

export function RecommendationCard({ rec, rank, selected, disabled, onToggle, onOpen, className, featured = false }: Props) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  const refs = rec.references ?? [];

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
          <button type="button" className={styles.imageButton} onClick={onOpen} aria-label={`${(zh ? "详情" : "Details")}: ${rec.shoe_name}`}>
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
            <h3 className={styles.shoeName}><button type="button" onClick={onOpen} className={styles.nameButton}>{rec.shoe_name}</button></h3>
            <div className={styles.rating}>
              {rec.stars == null ? <span>{translate("Not enough rating data")}</span> : <StarRating value={rec.stars} size="sm" showNumber />}
            </div>
            {rec.reason && <p className={styles.reason}>{rec.reason}</p>}
          </div>
        </div>
        <div className={styles.cardFooter}>
          <span className={styles.sourceCount}>{refs.length > 0 ? `${translate("Sources")} · ${refs.length}` : ""}</span>
          <button type="button" className={styles.detailsButton} onClick={onOpen}>
            {(zh ? "详情" : "Details")}<ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </div>
      </article>

    </>
  );
}
