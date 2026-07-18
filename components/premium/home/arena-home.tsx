"use client";

// ARENA (Champion) home — the site as awards night. A Top-3 podium opens
// (2-1-3 arrangement on desktop), scene collections become championship banners,
// the member's favorites form a starting five, the picker becomes a scout report,
// and the database is the full standings. All from the existing finalStars
// ranking — no new data.

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, ClipboardList } from "lucide-react";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { PremiumDatabase } from "@/components/premium/home/premium-database";
import { ArenaLineup } from "@/components/premium/home/arena-lineup";
import { ShoeCard } from "@/components/home/shoe-card";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { resolveCollection, topRated, type PremiumHomeProps } from "@/components/premium/home/shared";
import type { Shoe } from "@/lib/types";

const PLACE_ORDER = ["md:order-2", "md:order-1", "md:order-3"]; // rank1 centered on desktop

function PodiumStep({ shoe, place }: { shoe: Shoe; place: number }) {
  const { translate } = useLocale();
  return (
    <div className={`pui-podium-step ${PLACE_ORDER[place - 1] ?? ""}`} data-place={place}>
      <div className="flex items-start justify-between gap-2">
        <span className="pui-podium-rank">{place}</span>
        {place === 1 && <span className="pui-kicker self-center">{translate("Champion")}</span>}
      </div>
      <Link href={`/shoes/${shoe.slug}` as Route} className="mt-1 block">
        <div className="shoe-stage pui-plate mb-3 aspect-square">
          <ShoeImage
            src={shoe.image_url}
            alt={shoe.shoe_name}
            fallbackLabel={translate("No image")}
            variant="detail"
            priority={place === 1}
            className="!w-[84%] !max-w-none"
          />
        </div>
        <div className="pui-arena-title text-lg leading-tight">{shoe.shoe_name}</div>
        <div className="mt-1 text-[0.72rem] uppercase tracking-[0.14em] text-[rgb(var(--subtext))]">{shoe.brand}</div>
        <div className="mt-2">
          <StarRatingSlot value={shoe.finalStars ?? null} size="sm" showNumber count={shoe.userRatingCount ?? 0} />
        </div>
      </Link>
    </div>
  );
}

export function ArenaHome({ shoes, shoesCount, brandsCount, initialQuery, forYou, collections }: PremiumHomeProps) {
  const { translate } = useLocale();
  const { persona } = usePersona();

  useNavScrollSections([
    { id: "home-podium", label: translate("The Podium") },
    { id: "home-standings", label: translate("Full standings") },
  ]);

  const podium = topRated(shoes, 3);
  const byId = new Map(shoes.map((s) => [s.id, s]));
  const popular = forYou.popular.map((s) => byId.get(s.id)).filter((x): x is Shoe => Boolean(x));

  return (
    <HomeModeProvider defaultMode={persona ? "personalized" : "browse"}>
      <div className="has-mobile-nav-pad">
        {/* Podium */}
        <section id="home-podium" className="container-shell" style={{ scrollMarginTop: "var(--top-nav-h)", paddingTop: "1.5rem" }}>
          <div className="pui-sweep">
            <p className="pui-kicker">{translate("The Podium")}</p>
            <h1 className="pui-arena-title mt-1" style={{ fontSize: "clamp(2rem, 6vw, 3.4rem)" }}>
              {translate("This season's best")}
            </h1>
          </div>
          {podium.length >= 3 && (
            <div className="pui-podium mt-10 md:mt-[4.5rem]">
              {podium.map((s, i) => (
                <PodiumStep key={s.id} shoe={s} place={i + 1} />
              ))}
            </div>
          )}
        </section>

        {/* Banners */}
        {collections.length > 0 && (
          <section className="container-shell pui-section">
            <div className="pui-section-head">
              <span className="pui-kicker">{translate("Championship banners")}</span>
            </div>
            <div className="grid gap-6">
              {collections.map((c) => {
                const items = resolveCollection(shoes, c.shoeIds).slice(0, 8);
                if (items.length === 0) return null;
                return (
                  <div key={c.id} className="pui-banner p-4">
                    <h3 className="pui-arena-title mb-3 text-base">{translate(c.title)}</h3>
                    <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {items.map((s, i) => (
                        <ShoeCard key={s.id} shoe={s} index={i} rankBadge={i + 1} className="w-[150px] shrink-0" />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Starting five */}
        <section className="container-shell pui-section">
          <div className="pui-section-head">
            <span className="pui-kicker">{translate("Your starting five")}</span>
          </div>
          <ArenaLineup shoes={shoes} fallback={popular} />
        </section>

        {/* Scout report */}
        <section className="container-shell pui-section">
          <Link href={"/quick-picker" as Route} className="pui-banner group flex items-center gap-4 p-4">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[rgb(var(--pui-gold))] text-[#1a1305]">
              <ClipboardList className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="pui-arena-title text-base">{translate("Scout report")}</p>
              <p className="truncate text-[0.82rem] text-[rgb(var(--subtext))]">{translate("Answer 3 quick questions — no account needed.")}</p>
            </div>
            <ArrowRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-0.5" />
          </Link>
        </section>

        {/* Standings */}
        <div id="home-standings" style={{ scrollMarginTop: "var(--top-nav-h)" }} className="pui-section">
          <div className="container-shell">
            <div className="pui-section-head">
              <span className="pui-kicker">{translate("Full standings")}</span>
            </div>
          </div>
          <PremiumDatabase
            shoes={shoes}
            shoesCount={shoesCount}
            brandsCount={brandsCount}
            initialQuery={initialQuery}
            ctaLabel={translate("Open the standings")}
          />
        </div>
      </div>
    </HomeModeProvider>
  );
}
