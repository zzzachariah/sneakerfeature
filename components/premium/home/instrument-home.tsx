"use client";

// INSTRUMENT (Aurora) home — 中央指挥台 / a central command console. A glass
// console (the Quick Picker, promoted to the hero) sits centered, precisely
// framed by two MIRRORED readout rails — catalogue stats on the left, "for you"
// recommendations on the right — like sitting in a cockpit built for choosing a
// shoe. Below: collections as a calm band, then the collapsed full catalogue.
// Mono numerals throughout; restrained cyan glow. Clean neutral shoe stages.

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { PremiumDatabase } from "@/components/premium/home/premium-database";
import { ShoeCard } from "@/components/home/shoe-card";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { resolveCollection, topRated, type PremiumHomeProps } from "@/components/premium/home/shared";
import type { Shoe } from "@/lib/types";

// Count-up on mount for a single numeric readout (respects reduced motion).
function useCountUp(target: number, ms = 850) {
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

function Readout({ k, value, format }: { k: string; value: number; format?: (n: number) => string }) {
  const v = useCountUp(value);
  return (
    <div className="pui-readout">
      <span className="v" suppressHydrationWarning>{format ? format(v) : v.toLocaleString()}</span>
      <span className="k">{k}</span>
    </div>
  );
}

export function InstrumentHome({ shoes, shoesCount, brandsCount, initialQuery, forYou, collections }: PremiumHomeProps) {
  const { translate } = useLocale();
  const { persona } = usePersona();
  const [activeId, setActiveId] = useState(collections[0]?.id ?? "");

  useNavScrollSections([
    { id: "home-console", label: translate("Match console") },
    { id: "home-grid", label: translate("Database") },
  ]);

  // Readouts derived from the catalogue we already have — no new query.
  const rated = shoes.filter((s) => s.finalStars != null);
  const avg = rated.length ? rated.reduce((a, s) => a + (s.finalStars ?? 0), 0) / rated.length : 0;
  const samples = shoes.reduce((a, s) => a + (s.userRatingCount ?? 0), 0);

  const byId = new Map(shoes.map((s) => [s.id, s]));
  const recos: Shoe[] = (forYou.popular.length ? forYou.popular.map((s) => byId.get(s.id)) : topRated(shoes, 3))
    .filter((s): s is Shoe => Boolean(s))
    .slice(0, 3);

  const activeCol = collections.find((c) => c.id === activeId) ?? collections[0];
  const datasetItems = activeCol ? resolveCollection(shoes, activeCol.shoeIds).slice(0, 12) : [];

  return (
    <HomeModeProvider defaultMode={persona ? "personalized" : "browse"}>
      <div className="has-mobile-nav-pad">
       <div className="container-shell">
        {/* HUD strip */}
        <div className="pui-hud mt-4" id="home-console" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
          <div className="pui-hud-cell">
            <span className="v pui-mono">SNEAKERFEATURE</span>
            <span className="k">{translate("Decision instrument")}</span>
          </div>
          <div className="ml-auto pui-hud-live">{translate("Live")}</div>
        </div>

        {/* Command band: readouts · console · recommendations */}
        <section className="pui-command">
          {/* Left rail — readouts */}
          <div className="pui-rail">
            <Readout k={translate("shoes indexed")} value={shoesCount} />
            <Readout k={translate("Average rating")} value={Math.round(avg * 10)} format={(n) => (n / 10).toFixed(1)} />
            <Readout k={translate("Ratings sampled")} value={samples} />
          </div>

          {/* Center — the console */}
          <div className="pui-console">
            <p className="pui-kicker">{translate("Match console")}</p>
            <h1 className="t-display-sm mt-2" style={{ fontSize: "clamp(1.5rem, 3.4vw, 2.4rem)" }}>
              {translate("Pick the pair that's yours.")}
            </h1>
            <Link href={"/quick-picker" as Route} className="pui-console-input" aria-label={translate("Run the match engine")}>
              <span className="prompt">&gt;</span>
              <span className="min-w-0 flex-1 truncate">{translate("position · brand · court · budget …")}</span>
              <span className="cursor" aria-hidden />
            </Link>
            <Link href={"/quick-picker" as Route} className="pui-cta">
              {translate("Run the match engine")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {/* Right rail — recommendations */}
          <div className="pui-rail pui-rail--right">
            <p className="pui-kicker">{translate("For you")}</p>
            {recos.map((s) => (
              <Link key={s.id} href={`/shoes/${s.slug}` as Route} prefetch className="pui-reco-row group">
                <span className="pui-reco-thumb shoe-stage">
                  <ShoeImage src={s.image_url} alt={s.shoe_name} fallbackLabel="" variant="detail" className="!w-[84%] !max-w-none !border-0" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[0.82rem] font-medium">{s.shoe_name}</span>
                  <span className="block truncate text-[0.66rem] uppercase tracking-[0.12em] text-[rgb(var(--subtext))]">{s.brand}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* Datasets */}
        {collections.length > 0 && (
          <section className="pui-section">
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
            <ul className="mt-4 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {datasetItems.map((s, i) => (
                <ShoeCard key={s.id} shoe={s} index={i} className="w-[160px] shrink-0" />
              ))}
            </ul>
          </section>
        )}
       </div>

        {/* Full catalogue (collapsed) — PremiumDatabase brings its own container-shell */}
        <div id="home-grid" style={{ scrollMarginTop: "var(--top-nav-h)" }} className="pui-section">
          <div className="container-shell">
            <div className="pui-section-head">
              <span className="pui-kicker">{translate("Full catalog")}</span>
            </div>
          </div>
          <PremiumDatabase shoes={shoes} shoesCount={shoesCount} brandsCount={brandsCount} initialQuery={initialQuery} />
        </div>
      </div>
    </HomeModeProvider>
  );
}
