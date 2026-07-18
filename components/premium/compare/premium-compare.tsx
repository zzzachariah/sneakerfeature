"use client";

// Premium compare recomposer — one component, all four skins. It reuses the
// independent compare sub-components (plinths / verdict / radar / diff rows /
// spec table) and reorders the three sections (Lineup / Profile / Specs) per
// skin, with a slim shared action hero on top. Standard users get the untouched
// CompareSlides (via CompareSwitch); this file is premium-only.

import { useState } from "react";
import { Bookmark, Plus, Share2 } from "lucide-react";
import { ComparePlinths } from "@/components/compare/compare-plinths";
import { CompareRadar } from "@/components/compare/compare-radar";
import { CompareDiffRows } from "@/components/compare/compare-diff-rows";
import { CompareVerdict } from "@/components/compare/compare-verdict";
import { CompareSpecTable } from "@/components/compare/compare-spec-table";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Props as CompareProps } from "@/components/compare/compare-slides";
import type { PremiumVariant } from "@/components/premium/variants";

type SectionKey = "lineup" | "profile" | "specs";
const OFFSET = { scrollMarginTop: "var(--top-nav-h)" } as const;
const SECTION_ID: Record<SectionKey, string> = {
  lineup: "compare-lineup",
  profile: "compare-profile",
  specs: "compare-specs",
};

// Instrument & Arena lead with the verdict/profile (the decision); Gallery leads
// with the raw spec table (quiet analysis); Editorial keeps the classic order.
const ORDERS: Record<Exclude<PremiumVariant, "standard">, SectionKey[]> = {
  editorial: ["lineup", "profile", "specs"],
  instrument: ["profile", "lineup", "specs"],
  gallery: ["specs", "profile", "lineup"],
  arena: ["profile", "lineup", "specs"],
};

export function PremiumCompare({
  variant,
  shoes,
  canAdd,
  canSave,
  canShare,
  onAdd,
  onSave,
  onShare,
  onRemove,
  onClear,
}: CompareProps & { variant: Exclude<PremiumVariant, "standard"> }) {
  const { translate } = useLocale();
  const [showRatingDetail, setShowRatingDetail] = useState(false);
  const order = ORDERS[variant];

  const NAV_LABEL: Record<SectionKey, string> = {
    lineup: translate("Lineup"),
    profile: translate("Profile"),
    specs: translate("Specs"),
  };
  useNavScrollSections(order.map((k) => ({ id: SECTION_ID[k], label: NAV_LABEL[k] })));

  const sections: Record<SectionKey, React.ReactNode> = {
    lineup: (
      <section key="lineup" id="compare-lineup" style={OFFSET} className="container-shell py-8 md:py-12">
        <ComparePlinths shoes={shoes} onRemove={onRemove} onAdd={onAdd} canAdd={canAdd} showRatingDetail={showRatingDetail} />
      </section>
    ),
    profile: (
      <section key="profile" id="compare-profile" style={OFFSET} className="container-shell py-8 md:py-12">
        <p className="t-eyebrow mb-6 text-center">{translate("Performance Profile")}</p>
        {shoes.length > 1 ? (
          <div className="mb-8 md:mb-10">
            <CompareVerdict shoes={shoes} />
          </div>
        ) : null}
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-x-14 lg:gap-y-8">
          <div>
            <CompareRadar shoes={shoes} />
          </div>
          <div>
            <CompareDiffRows shoes={shoes} />
          </div>
        </div>
      </section>
    ),
    specs: (
      <section key="specs" id="compare-specs" style={OFFSET} className="container-shell py-8 md:py-12">
        <p className="t-eyebrow mb-5 text-center">{translate("Tech Specifications")}</p>
        <CompareSpecTable shoes={shoes} />
      </section>
    ),
  };

  return (
    <div className="has-mobile-nav-pad">
      <section className="container-shell pt-8">
        <div className="text-center">
          <p className="pui-kicker">{translate("Head to Head")}</p>
          <h1 className="t-display-sm mt-1" style={{ fontSize: "clamp(2rem, 4.5vw, 3.4rem)" }}>
            {translate("Compare")}
          </h1>
          <p className="mt-3 text-[0.85rem] soft-text">
            {shoes.map((shoe, i) => (
              <span key={shoe.id}>
                <span className="text-[rgb(var(--text)/0.9)]">{shoe.shoe_name}</span>
                {i < shoes.length - 1 ? <span className="mx-2 opacity-40">/</span> : null}
              </span>
            ))}
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <ActionButton onClick={onAdd} disabled={!canAdd} icon={<Plus className="h-3.5 w-3.5" />} label={translate("Add shoe")} />
            {canSave ? <ActionButton onClick={onSave} icon={<Bookmark className="h-3.5 w-3.5" />} label={translate("Save compare")} /> : null}
            {canShare ? <ActionButton onClick={onShare} icon={<Share2 className="h-3.5 w-3.5" />} label={translate("Share card")} /> : null}
            <ActionButton
              onClick={() => setShowRatingDetail((v) => !v)}
              label={translate(showRatingDetail ? "Hide ratings detail" : "Show ratings detail")}
            />
            <button
              type="button"
              onClick={onClear}
              className="tap-44 rounded-md border border-transparent px-2 py-1 text-[0.72rem] soft-text transition hover:text-[rgb(var(--text))]"
            >
              {translate("Clear all")}
            </button>
          </div>
        </div>
      </section>

      {order.map((k) => sections[k])}
    </div>
  );
}

function ActionButton({ onClick, disabled, icon, label }: { onClick: () => void; disabled?: boolean; icon?: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="tap-44 inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))] disabled:cursor-not-allowed disabled:opacity-40"
    >
      {icon}
      {label}
    </button>
  );
}
