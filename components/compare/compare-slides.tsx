"use client";

import { useState } from "react";
import { Bookmark, Plus, Share2 } from "lucide-react";
import { ComparePlinths } from "@/components/compare/compare-plinths";
import { CompareRadar } from "@/components/compare/compare-radar";
import { CompareDiffRows } from "@/components/compare/compare-diff-rows";
import { CompareSpecTable } from "@/components/compare/compare-spec-table";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { Shoe } from "@/lib/types";

type Props = {
  shoes: Shoe[];
  canAdd: boolean;
  canSave: boolean;
  canShare: boolean;
  onAdd: () => void;
  onSave: () => void;
  onShare: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

const SECTION_OFFSET = { scrollMarginTop: "var(--top-nav-h)" } as const;

// Continuous-scroll compare (Lineup → Profile → Specs). The navbar shows a
// 3-stop indicator. The component name is kept for import stability even though
// it is no longer a slide deck.
export function CompareSlides({ shoes, canAdd, canSave, canShare, onAdd, onSave, onShare, onRemove, onClear }: Props) {
  const { translate } = useLocale();
  const [showRatingDetail, setShowRatingDetail] = useState(false);

  useNavScrollSections([
    { id: "compare-lineup", label: translate("Lineup") },
    { id: "compare-profile", label: translate("Profile") },
    { id: "compare-specs", label: translate("Specs") }
  ]);

  return (
    <div className="has-mobile-nav-pad">
      {/* Lineup: hero + plinths */}
      <section id="compare-lineup" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <HeroBlock
          shoes={shoes}
          canAdd={canAdd}
          canSave={canSave}
          canShare={canShare}
          onAdd={onAdd}
          onSave={onSave}
          onShare={onShare}
          onClear={onClear}
          showRatingDetail={showRatingDetail}
          onToggleRatingDetail={() => setShowRatingDetail((v) => !v)}
          translate={translate}
        />
        <div className="mt-6 md:mt-10">
          <ComparePlinths
            shoes={shoes}
            onRemove={onRemove}
            onAdd={onAdd}
            canAdd={canAdd}
            showRatingDetail={showRatingDetail}
          />
        </div>
      </section>

      {/* Profile: radar + diff rows */}
      <section id="compare-profile" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <p className="t-eyebrow mb-6 text-center">{translate("Performance Profile")}</p>
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
          <CompareRadar shoes={shoes} />
          <CompareDiffRows shoes={shoes} />
        </div>
      </section>

      {/* Specs: full tech table */}
      <section id="compare-specs" style={SECTION_OFFSET} className="container-shell py-8 md:py-12">
        <p className="t-eyebrow mb-5 text-center">{translate("Tech Specifications")}</p>
        <CompareSpecTable shoes={shoes} />
      </section>
    </div>
  );
}

function HeroBlock({
  shoes,
  canAdd,
  canSave,
  canShare,
  onAdd,
  onSave,
  onShare,
  onClear,
  showRatingDetail,
  onToggleRatingDetail,
  translate
}: {
  shoes: Shoe[];
  canAdd: boolean;
  canSave: boolean;
  canShare: boolean;
  onAdd: () => void;
  onSave: () => void;
  onShare: () => void;
  onClear: () => void;
  showRatingDetail: boolean;
  onToggleRatingDetail: () => void;
  translate: (value: string) => string;
}) {
  return (
    <div className="text-center">
      <p className="t-eyebrow mb-2">{translate("Head to Head")}</p>
      <h1
        className="font-extrabold leading-[1] tracking-[-0.04em]"
        style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.8rem)" }}
      >
        {translate("Compare")}
      </h1>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <p className="text-[0.85rem] tracking-[-0.005em] soft-text">
          {shoes.map((shoe, i) => (
            <span key={shoe.id}>
              <span className="text-[rgb(var(--text)/0.9)]">{shoe.shoe_name}</span>
              {i < shoes.length - 1 ? <span className="mx-2 opacity-40">/</span> : null}
            </span>
          ))}
        </p>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="relative tap-44 inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[rgb(var(--glass-stroke-soft)/0.4)] disabled:hover:text-[rgb(var(--subtext))]"
        >
          <Plus className="h-3.5 w-3.5" /> {translate("Add shoe")}
        </button>
        {canSave ? (
          <button
            type="button"
            onClick={onSave}
            className="relative tap-44 inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]"
          >
            <Bookmark className="h-3.5 w-3.5" /> {translate("Save compare")}
          </button>
        ) : null}
        {canShare ? (
          <button
            type="button"
            onClick={onShare}
            className="relative tap-44 inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]"
          >
            <Share2 className="h-3.5 w-3.5" /> {translate("Share card")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleRatingDetail}
          className="relative tap-44 inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]"
        >
          {translate(showRatingDetail ? "Hide ratings detail" : "Show ratings detail")}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="relative tap-44 rounded-md border border-transparent px-2 py-1 text-[0.72rem] soft-text transition hover:text-[rgb(var(--text))]"
        >
          {translate("Clear all")}
        </button>
      </div>
    </div>
  );
}
