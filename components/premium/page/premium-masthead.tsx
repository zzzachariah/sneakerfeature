"use client";

// A reusable per-skin page masthead. Secondary pages (Quick Picker, Smart Picker,
// Submit, Search, …) used to open with the same plain eyebrow + title regardless
// of the active Premium UI skin, so they read as "the default page in a different
// font". This gives each skin its own opening chrome — the same design vocabulary
// the home / detail / compare layouts already speak — so every page announces the
// active identity the moment it loads:
//   • Editorial — a magazine flag (serif kicker + issue line) over a serif title.
//   • Instrument — a HUD strip (mono readout + live pip) over a console title.
//   • Gallery — a quiet kicker + generous air, near-zero ornament.
//   • Arena — a gold hairline + sweep over a condensed, uppercase title.
//
// Callers place it inside their own container (it adds no container-shell), and
// only render it when a skin is active — the standard look keeps its own header
// untouched, so the no-skin render path never changes.

import type { PremiumVariant } from "@/components/premium/variants";
import { usePremiumTier } from "@/components/theme/premium-tier-context";

type Variant = Exclude<PremiumVariant, "standard">;

// The Max signal — a small chip in the skin's Max accent (--brand is the Max half
// of the skin once data-member-tier="max"), so every masthead that renders it
// announces the Max edition of the page. Locale-free: "Max" is the tier name in
// both languages (TIERS.max.nameZh === "Max"). Exported so the home layouts
// (which use their own inline mastheads, not this component) share one chip.
export function MaxSignal() {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[0.5rem] font-bold uppercase tracking-[0.2em]"
      style={{
        color: "rgb(var(--brand))",
        border: "1px solid rgb(var(--brand) / 0.5)",
        background: "rgb(var(--brand) / 0.12)",
      }}
    >
      <span aria-hidden>❖</span> Max
    </span>
  );
}

export function PremiumMasthead({
  variant,
  kicker,
  title,
  subtitle,
  meta,
}: {
  variant: Variant;
  kicker: string;
  title: string;
  subtitle?: string;
  /** Small contextual label, shown per-skin (issue line / live pip / plate). */
  meta?: string;
}) {
  const isMax = usePremiumTier() === "max";
  if (variant === "editorial") {
    return (
      <header className="pui-page-head">
        <div className="pui-ed-flag">
          <span className="pui-display text-base sm:text-lg">{kicker}</span>
          {meta ? <span className="pui-ed-issue">{meta}</span> : null}
          {isMax ? <MaxSignal /> : null}
        </div>
        <h1 className="pui-ed-title" style={{ fontSize: "clamp(1.9rem, 5vw, 3.2rem)" }}>
          {title}
        </h1>
        {subtitle ? (
          <p className="pui-serif mt-3 max-w-[54ch] text-[0.98rem] leading-relaxed text-[rgb(var(--subtext))]">{subtitle}</p>
        ) : null}
      </header>
    );
  }

  if (variant === "instrument") {
    return (
      <header className="pui-page-head">
        <div className="pui-hud">
          <div className="pui-hud-cell">
            <span className="v pui-mono" style={{ fontSize: "1.05rem" }}>
              {kicker.toUpperCase()}
            </span>
            {subtitle ? <span className="k">{subtitle}</span> : null}
          </div>
          {isMax ? <span className="ml-auto"><MaxSignal /></span> : null}
          <span className={`${isMax ? "" : "ml-auto "}pui-hud-live`}>{meta ?? "Live"}</span>
        </div>
        <h1 className="t-display-sm mt-4" style={{ fontSize: "clamp(1.6rem, 3.6vw, 2.5rem)" }}>
          {title}
        </h1>
      </header>
    );
  }

  if (variant === "arena") {
    return (
      <header className="pui-page-head">
        <div className="flex items-center justify-between gap-3">
          <span className="pui-kicker">{kicker}</span>
          <div className="flex shrink-0 items-center gap-2">
            {isMax ? <MaxSignal /> : null}
            {meta ? (
              <span className="pui-label text-[0.7rem] uppercase tracking-[0.2em] text-[rgb(var(--subtext))]">{meta}</span>
            ) : null}
          </div>
        </div>
        <hr className="pui-hairline mt-3" style={{ background: "rgb(var(--pui-gold) / 0.4)" }} />
        <div className="pui-sweep mt-5">
          <h1 className="pui-arena-title" style={{ fontSize: "clamp(1.9rem, 5.4vw, 3rem)" }}>
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-3 text-[0.76rem] uppercase tracking-[0.2em] text-[rgb(var(--subtext))]">{subtitle}</p>
          ) : null}
        </div>
      </header>
    );
  }

  // gallery — quiet-luxury: a whisper of a kicker, generous air, no rules.
  return (
    <header className="pui-page-head pui-page-head--gallery">
      <div className="flex items-center gap-2">
        <span className="pui-kicker">{kicker}</span>
        {isMax ? <MaxSignal /> : null}
      </div>
      <h1 className="pui-display mt-3" style={{ fontSize: "clamp(1.8rem, 4.4vw, 2.9rem)", lineHeight: 1.05 }}>
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-3 max-w-[54ch] text-[0.95rem] leading-relaxed text-[rgb(var(--subtext))]">{subtitle}</p>
      ) : null}
    </header>
  );
}
