"use client";

// Premium detail recomposer. One component drives all four skins: it keeps the
// shared wiring (share-card modal, nav sections, legacy #hash jumps) in ONE place
// and renders the exported detail sections in a per-variant ORDER with a
// per-variant chrome banner. The section internals are reused untouched; the
// site-wide premium CSS restyles their type/cards, and the reordering + banner
// give each skin its own reading structure. Standard users never reach this file
// (DetailSwitch renders the original ShoeDetailSlides for them).

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  DetailSection,
  OverviewSection,
  ReviewsSection,
  StorySection,
  CommentsSection,
  RelatedSection,
  type Props as DetailProps,
} from "@/components/detail/shoe-detail-slides";
import { PremiumPerformance } from "@/components/premium/detail/premium-performance";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import type { PremiumVariant } from "@/components/premium/variants";
import { usePremiumTier } from "@/components/theme/premium-tier-context";
import type { Tier } from "@/lib/subscription/tiers";

const CardPreviewModal = dynamic(
  () => import("@/components/card/card-preview-modal").then((m) => ({ default: m.CardPreviewModal })),
  { ssr: false, loading: () => null }
);

type SectionKey = "overview" | "performance" | "reviews" | "story" | "comments" | "related";

const SECTION_ID: Record<SectionKey, string> = {
  overview: "detail-overview",
  performance: "detail-performance",
  reviews: "detail-reviews",
  story: "detail-story",
  comments: "detail-comments",
  related: "detail-related",
};

// PRO reads each skin its own way — the overview (title + hero) stays the
// identity block, then the rest follows the skin's native pacing:
//   • Editorial — the cover story: story leads, numbers follow ("By the numbers").
//   • Instrument — the cockpit: performance next, wrapped as an instrument panel.
//   • Gallery — the monograph: performance, then story; quiet, unframed.
//   • Arena — the scout report: a gold "stat sheet" performance frame, reviews next.
const PRO_ORDERS: Record<Exclude<PremiumVariant, "standard">, SectionKey[]> = {
  editorial: ["overview", "story", "performance", "reviews", "comments", "related"],
  instrument: ["overview", "performance", "story", "reviews", "comments", "related"],
  gallery: ["overview", "performance", "story", "reviews", "comments", "related"],
  arena: ["overview", "performance", "reviews", "story", "comments", "related"],
};

// MAX composes the page differently — one concierge cut regardless of skin:
// lead with the analysis (performance), then the pros' takes (reviews), and only
// then the story. This is the structural expression of the Max tier's "deep /
// concierge" promise (see TIERS.max.prompt), paired with the ConciergeStrip
// below. Champion → arena is Max-only, so PRO_ORDERS.arena is never actually
// reached; it's kept for type completeness.
const MAX_ORDER: SectionKey[] = ["overview", "performance", "reviews", "story", "comments", "related"];

function orderFor(variant: Exclude<PremiumVariant, "standard">, tier: Tier): SectionKey[] {
  return tier === "max" ? MAX_ORDER : PRO_ORDERS[variant];
}

const HASH_TO_ID: Record<string, string> = {
  "#overview": "detail-overview",
  "#performance": "detail-performance",
  "#reviews": "detail-reviews",
  "#story": "detail-story",
  "#comments": "detail-comments",
  "#related": "detail-related",
};

export function PremiumDetail({ variant, ...props }: DetailProps & { variant: Exclude<PremiumVariant, "standard"> }) {
  const { translate } = useLocale();
  const tier = usePremiumTier();
  const [shareOpen, setShareOpen] = useState(false);
  const order = orderFor(variant, tier);

  const NAV_LABEL: Record<SectionKey, string> = {
    overview: translate("Overview"),
    performance: translate("Performance"),
    reviews: translate("Pro reviews"),
    story: translate("Story"),
    comments: translate("Comments"),
    related: translate("Related"),
  };
  useNavScrollSections(order.map((k) => ({ id: SECTION_ID[k], label: NAV_LABEL[k] })));

  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = HASH_TO_ID[window.location.hash.toLowerCase()];
    if (!id) return;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
  }, []);

  const jumpTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  const renderers: Record<SectionKey, () => React.ReactNode> = {
    overview: () => (
      <OverviewSection {...props} onShareCard={() => setShareOpen(true)} onJumpToComments={() => jumpTo("detail-comments")} />
    ),
    performance: () => (
      <PremiumPerformance variant={variant} shoe={props.shoe} extraTechCards={props.extraTechCards} radarAxes={props.radarAxes} />
    ),
    reviews: () => <ReviewsSection bloggerReviews={props.bloggerReviews} />,
    story: () => <StorySection {...props} />,
    comments: () => <CommentsSection {...props} />,
    related: () => <RelatedSection {...props} />,
  };

  return (
    <>
      <div className="has-mobile-nav-pad">
        {tier === "max" ? <ConciergeStrip /> : null}
        <DetailBanner variant={variant} brand={props.shoe.brand} />
        {order.map((key) => (
          <DetailSection key={key} id={SECTION_ID[key]}>
            {renderers[key]()}
          </DetailSection>
        ))}
      </div>

      <CardPreviewModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        mode={{ kind: "single", shoe: props.shoe, axes: props.radarAxes }}
      />
    </>
  );
}

// Max-only lead block. It both signals the Max edition and frames WHY the page
// is ordered the way it is (analysis → reviews → story), so the reordering reads
// as intentional concierge curation rather than a shuffle. Tinted with --brand,
// which is the skin's Max accent once data-member-tier="max".
function ConciergeStrip() {
  const { locale } = useLocale();
  const zh = locale === "zh";
  return (
    <div className="container-shell pt-4">
      <div
        className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-full px-3.5 py-1.5"
        style={{ border: "1px solid rgb(var(--brand) / 0.4)", background: "rgb(var(--brand) / 0.08)" }}
      >
        <span aria-hidden className="text-sm leading-none" style={{ color: "rgb(var(--brand))" }}>
          ❖
        </span>
        <span className="text-[0.58rem] font-bold uppercase tracking-[0.22em]" style={{ color: "rgb(var(--brand))" }}>
          Max Concierge
        </span>
        <span className="text-[0.75rem] soft-text">
          {zh ? "先看数据与专业口碑，再读故事" : "Numbers and the pros' takes first — the story follows"}
        </span>
      </div>
    </div>
  );
}

// A slim contextual masthead per skin — deliberately does NOT repeat the shoe
// name (OverviewSection owns that), so it reads as chrome, not a duplicate title.
function DetailBanner({ variant, brand }: { variant: Exclude<PremiumVariant, "standard">; brand: string }) {
  const { translate } = useLocale();
  if (variant === "editorial") {
    return (
      <div className="container-shell pt-4">
        <div className="pui-ed-flag">
          <span className="pui-display text-base sm:text-lg">{translate("Feature")}</span>
          <span className="pui-ed-issue">{brand}</span>
        </div>
      </div>
    );
  }
  if (variant === "instrument") {
    return (
      <div className="container-shell pt-4">
        <div className="pui-hud">
          <span className="pui-hud-live">{translate("Data panel")}</span>
          <span className="ml-auto pui-mono text-[0.72rem] uppercase tracking-[0.18em] text-[rgb(var(--subtext))]">{brand}</span>
        </div>
      </div>
    );
  }
  if (variant === "arena") {
    return (
      <div className="container-shell pt-4">
        <div className="pui-banner pui-sweep flex items-center justify-between p-3">
          <span className="pui-kicker">{translate("Scout report")}</span>
          <span className="pui-label text-[0.72rem] uppercase tracking-[0.18em] text-[rgb(var(--subtext))]">{brand}</span>
        </div>
      </div>
    );
  }
  return null; // gallery: no banner, stays quiet
}
