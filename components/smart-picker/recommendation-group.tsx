"use client";

import { useState } from "react";
import Link from "next/link";
import { GitCompare } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { RecommendationCard } from "@/components/smart-picker/recommendation-card";
import { MAX_COMPARE, type RecommendationItem } from "@/lib/ai/types";
import type { Route } from "next";
import styles from "./recommendation-shortlist.module.css";

export function RecommendationGroup({ recommendations, onOpen }: { recommendations: RecommendationItem[]; onOpen: (rec: RecommendationItem) => void }) {
  const { translate } = useLocale();
  // Default-select the first up-to-5 so the compare button works out of the box;
  // the user can freely change the selection (max 5).
  const [selected, setSelected] = useState<string[]>(() =>
    recommendations.slice(0, MAX_COMPARE).map((rec) => rec.shoe_id)
  );

  const toggle = (shoeId: string) => {
    setSelected((prev) => {
      if (prev.includes(shoeId)) return prev.filter((id) => id !== shoeId);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, shoeId];
    });
  };

  const atLimit = selected.length >= MAX_COMPARE;
  const canCompare = selected.length >= 2;
  const compareHref = `/compare?ids=${selected.join(",")}` as Route;

  return (
    <div className={styles.shortlist}>
      <div className={styles.cards}>
        {recommendations.map((rec, i) => (
          <div key={rec.shoe_id} className={i === 0 ? styles.primarySlot : styles.alternativeSlot}>
            <RecommendationCard
              rec={rec}
              rank={i + 1}
              selected={selected.includes(rec.shoe_id)}
              disabled={atLimit}
              onToggle={() => toggle(rec.shoe_id)}
              onOpen={() => onOpen(rec)}
              featured={i === 0}
            />
          </div>
        ))}
      </div>

      {recommendations.length >= 2 && (
        <div className={styles.compareBar}>
          <span className="num-display text-[0.78rem] soft-text">
            {recommendations.length > MAX_COMPARE
              ? `${translate("Pick up to 5 to compare")} · ${selected.length}/${MAX_COMPARE}`
              : `${translate("Selected")} ${selected.length}/${MAX_COMPARE}`}
          </span>
          {canCompare ? (
            <Link
              href={compareHref}
              className={styles.compareButton}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {translate("Compare selected")}
            </Link>
          ) : (
            <span className={styles.compareButton} aria-disabled="true">
              <GitCompare className="h-3.5 w-3.5" />
              {translate("Compare selected")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
