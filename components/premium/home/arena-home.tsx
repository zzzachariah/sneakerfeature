"use client";

// ARENA (Champion) home — 殿堂之墙 / a Hall of Fame wall. The season's highest-
// rated shoes are "inducted": each hangs in a thin gold-edged plaque on a clean
// neutral ground, laid out as a museum-style equal-width wall with generous air.
// Below, the member's favorites form a starting five, the picker is a scout
// report, and the database is the full standings. All from the existing
// finalStars ranking — no new data.

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, ClipboardList } from "lucide-react";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { PremiumDatabase } from "@/components/premium/home/premium-database";
import { ArenaLineup } from "@/components/premium/home/arena-lineup";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { topRated, type PremiumHomeProps } from "@/components/premium/home/shared";
import type { Shoe } from "@/lib/types";
import { ClosetHomeRail } from "@/components/closet/closet-home-rail";

function Plaque({ shoe, rank, priority }: { shoe: Shoe; rank: number; priority?: boolean }) {
  const { translate } = useLocale();
  return (
    <Link href={`/shoes/${shoe.slug}` as Route} prefetch className="pui-plaque group">
      <div className="pui-plaque-plate shoe-stage">
        <span className="pui-plaque-serial">Nº {String(rank).padStart(2, "0")}</span>
        <ShoeImage
          src={shoe.image_url}
          alt={shoe.shoe_name}
          fallbackLabel={translate("No image")}
          variant="detail"
          priority={priority}
          className="!w-[80%] !max-w-none !border-0"
        />
      </div>
      <div className="pui-plaque-cap">
        <span className="pui-plaque-brand">{shoe.brand}</span>
        <span className="pui-plaque-name">{shoe.shoe_name}</span>
        <div className="mt-2">
          <StarRatingSlot value={shoe.finalStars ?? null} size="sm" showNumber count={shoe.userRatingCount ?? 0} />
        </div>
      </div>
    </Link>
  );
}

export function ArenaHome({ shoes, shoesCount, brandsCount, initialQuery, forYou }: PremiumHomeProps) {
  const { translate } = useLocale();
  const { persona } = usePersona();

  useNavScrollSections([
    { id: "home-hall", label: translate("Hall") },
    { id: "home-standings", label: translate("Standings") },
  ]);

  // Only hang framed shoes on the wall — an empty "no image" plaque cheapens the
  // showcase. Take the highest-rated that actually have a product image.
  const inducted = topRated(shoes, 30)
    .filter((s) => s.image_url)
    .slice(0, 9);
  const byId = new Map(shoes.map((s) => [s.id, s]));
  const popular = forYou.popular.map((s) => byId.get(s.id)).filter((x): x is Shoe => Boolean(x));
  const year = 2026;

  return (
    <HomeModeProvider defaultMode={persona ? "personalized" : "browse"}>
      <div className="has-mobile-nav-pad">
        {/* Masthead */}
        <section id="home-hall" className="container-shell" style={{ scrollMarginTop: "var(--top-nav-h)", paddingTop: "1.5rem" }}>
          <div className="flex items-center justify-between">
            <span className="pui-kicker">{translate("Hall of Fame")}</span>
            <Link href={"/quick-picker" as Route} className="text-[0.7rem] uppercase tracking-[0.18em] text-[rgb(var(--subtext))] transition-opacity hover:opacity-70">
              {translate("Quick Picker")} →
            </Link>
          </div>
          <hr className="pui-hairline mt-3" style={{ background: "rgb(var(--pui-gold) / 0.4)" }} />
          <div className="pui-sweep mt-8">
            <p className="pui-kicker">{translate("Inducted")} · {year}</p>
            <h1 className="pui-arena-title mt-2" style={{ fontSize: "clamp(2.2rem, 6.5vw, 4rem)" }}>
              {translate("Hall of Fame")}
            </h1>
            <p className="mt-3 text-[0.8rem] uppercase tracking-[0.2em] text-[rgb(var(--subtext))]">
              {translate("Ranked by championship rating")}
            </p>
          </div>
        </section>

        {/* The wall */}
        {inducted.length > 0 && (
          <section className="container-shell pui-section">
            <div className="pui-hall">
              {inducted.map((s, i) => (
                <Plaque key={s.id} shoe={s} rank={i + 1} priority={i < 3} />
              ))}
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

        {/* The locker room — the member's own closet as locker stalls */}
        <ClosetHomeRail shoes={shoes} />

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
