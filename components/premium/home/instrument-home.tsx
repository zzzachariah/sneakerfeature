"use client";

// INSTRUMENT (Aurora) home — the site as a decision instrument. A HUD readout
// bar opens, the picker is promoted to a first-screen console, scene collections
// become switchable datasets, and the database is expanded by default (D3) with
// match% on the cards (HomeFeed's personalized mode). Mono numerals throughout.

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Gauge } from "lucide-react";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { PremiumDatabase } from "@/components/premium/home/premium-database";
import { ShoeCard } from "@/components/home/shoe-card";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { resolveCollection, type PremiumHomeProps } from "@/components/premium/home/shared";

// Count-up on mount for the HUD readouts (respects reduced motion).
function useCountUp(target: number, ms = 900) {
  const [v, setV] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setV(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const step = (t: number) => {
      if (!start) start = t;
      const p = Math.min((t - start) / ms, 1);
      setV(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function Hud({ shoesCount, brandsCount }: { shoesCount: number; brandsCount: number }) {
  const { translate } = useLocale();
  const s = useCountUp(shoesCount);
  const b = useCountUp(brandsCount);
  return (
    <div className="pui-hud">
      <div className="pui-hud-cell">
        <span className="v" suppressHydrationWarning>{s.toLocaleString()}</span>
        <span className="k">{translate("shoes indexed")}</span>
      </div>
      <div className="pui-hud-cell">
        <span className="v" suppressHydrationWarning>{b.toLocaleString()}</span>
        <span className="k">{translate("brands represented")}</span>
      </div>
      <div className="ml-auto pui-hud-live">{translate("Live")}</div>
    </div>
  );
}

export function InstrumentHome({ shoes, shoesCount, brandsCount, initialQuery, collections }: PremiumHomeProps) {
  const { translate } = useLocale();
  const { persona } = usePersona();
  const [activeId, setActiveId] = useState(collections[0]?.id ?? "");

  useNavScrollSections([
    { id: "home-console", label: translate("Match console") },
    { id: "home-grid", label: translate("Database") },
  ]);

  const activeCol = collections.find((c) => c.id === activeId) ?? collections[0];
  const datasetItems = activeCol ? resolveCollection(shoes, activeCol.shoeIds).slice(0, 12) : [];

  return (
    <HomeModeProvider defaultMode={persona ? "personalized" : "browse"}>
      <div className="has-mobile-nav-pad">
        <section id="home-console" className="container-shell" style={{ scrollMarginTop: "var(--top-nav-h)", paddingTop: "1.25rem" }}>
          <Hud shoesCount={shoesCount} brandsCount={brandsCount} />

          <div className="pui-console mt-4">
            <p className="pui-kicker">{translate("Match console")}</p>
            <h1 className="t-display-sm mt-2" style={{ fontSize: "clamp(1.6rem, 4vw, 2.6rem)" }}>
              {translate("Tell it what you need. It computes the match.")}
            </h1>
            <p className="mt-2 max-w-[52ch] text-[rgb(var(--subtext))]">
              {translate("Cushion, traction, court feel — structured and comparable. Because choosing a shoe shouldn't take 10 tabs.")}
            </p>
            <Link href={"/quick-picker" as Route} className="pui-cta mt-5">
              <Gauge className="h-4 w-4" />
              {translate("Run the match engine")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>

        {/* Datasets */}
        {collections.length > 0 && (
          <section className="container-shell pui-section">
            <div className="pui-section-head">
              <span className="pui-kicker">{translate("Datasets")}</span>
            </div>
            <div className="pui-tabs" role="tablist">
              {collections.map((c) => (
                <button
                  key={c.id}
                  role="tab"
                  aria-selected={c.id === activeCol?.id}
                  data-active={c.id === activeCol?.id}
                  className="pui-tab"
                  onClick={() => setActiveId(c.id)}
                >
                  {translate(c.title)}
                </button>
              ))}
            </div>
            <ul className="mt-3 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {datasetItems.map((s, i) => (
                <ShoeCard key={s.id} shoe={s} index={i} className="w-[160px] shrink-0" />
              ))}
            </ul>
          </section>
        )}

        {/* Full database — expanded by default (D3) */}
        <div id="home-grid" style={{ scrollMarginTop: "var(--top-nav-h)" }} className="pui-section">
          <div className="container-shell">
            <div className="pui-section-head">
              <span className="pui-kicker">{translate("Full catalog")}</span>
            </div>
          </div>
          <PremiumDatabase
            shoes={shoes}
            shoesCount={shoesCount}
            brandsCount={brandsCount}
            initialQuery={initialQuery}
          />
        </div>
      </div>
    </HomeModeProvider>
  );
}
