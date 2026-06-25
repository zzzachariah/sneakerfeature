"use client";

import { useState } from "react";
import Link from "next/link";
import { GitCompare } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { RecommendationCard } from "@/components/smart-picker/recommendation-card";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { MAX_COMPARE, type RecommendationItem } from "@/lib/ai/types";
import type { Route } from "next";

export function RecommendationGroup({ recommendations }: { recommendations: RecommendationItem[] }) {
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
    <div className="space-y-2">
      <Stagger
        className="grid items-stretch gap-2.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" }}
        gap={0.06}
      >
        {recommendations.map((rec, i) => (
          <StaggerItem key={rec.shoe_id} className="flex flex-col">
            <RecommendationCard
              rec={rec}
              rank={i + 1}
              selected={selected.includes(rec.shoe_id)}
              disabled={atLimit}
              onToggle={() => toggle(rec.shoe_id)}
              className="flex-1"
            />
          </StaggerItem>
        ))}
      </Stagger>

      {recommendations.length >= 2 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--surface)/0.55)] px-3 py-2">
          <span className="num-display text-[0.78rem] soft-text">
            {recommendations.length > MAX_COMPARE
              ? `${translate("Pick up to 5 to compare")} · ${selected.length}/${MAX_COMPARE}`
              : `${translate("Selected")} ${selected.length}/${MAX_COMPARE}`}
          </span>
          {canCompare ? (
            <Link
              href={compareHref}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[rgb(var(--text))] px-3 text-[0.78rem] font-semibold text-[rgb(var(--bg))] transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]"
            >
              <GitCompare className="h-3.5 w-3.5" />
              {translate("Compare selected")}
            </Link>
          ) : (
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[rgb(var(--text)/0.18)] px-3 text-[0.78rem] font-semibold soft-text">
              <GitCompare className="h-3.5 w-3.5" />
              {translate("Compare selected")}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
