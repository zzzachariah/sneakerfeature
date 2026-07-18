"use client";

// EDITORIAL (Sapphire) home — the site as a curated sneaker magazine. A serif
// masthead + "cover story" opens; the editor's spread leads with ONE hero pick
// and a curated shortlist (magazine hierarchy, not a wall of identical cards);
// then a vitrine of scene collections and the database recast as "The Archive".
// Reuses the standard data (forYou / collections / shoes) + ShoeImage.

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { QuickPickerEntry } from "@/components/home/quick-picker-entry";
import { PremiumDatabase } from "@/components/premium/home/premium-database";
import { ShoeCard } from "@/components/home/shoe-card";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { resolveCollection, topRated, type PremiumHomeProps } from "@/components/premium/home/shared";
import type { Shoe } from "@/lib/types";

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function EditorialHome({ shoes, shoesCount, brandsCount, initialQuery, forYou, collections }: PremiumHomeProps) {
  const { translate } = useLocale();
  const { persona } = usePersona();

  useNavScrollSections([
    { id: "home-cover", label: translate("Cover") },
    { id: "home-archive", label: translate("Archive") },
  ]);

  const byId = new Map(shoes.map((s) => [s.id, s]));
  const ranked = topRated(shoes, 12);
  const coverShoe = resolveCollection(shoes, forYou.popular.map((s) => s.id))[0] ?? ranked[0];

  // Editor's spread: one hero pick + a curated shortlist. The shortlist prefers
  // the member's popular/recent, then fills from the top-rated, de-duplicated and
  // never repeating the hero.
  const feature = ranked[0] ?? coverShoe;
  const pool: Shoe[] = [
    ...forYou.popular.map((s) => byId.get(s.id)),
    ...forYou.recentShoes.map((s) => byId.get(s.id)),
    ...ranked,
  ].filter((s): s is Shoe => Boolean(s));
  const shortlist: Shoe[] = [];
  const seen = new Set<string>([feature?.id ?? ""]);
  for (const s of pool) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    shortlist.push(s);
    if (shortlist.length >= 5) break;
  }

  const year = new Date().getFullYear();
  const week = isoWeek(new Date());

  return (
    <HomeModeProvider defaultMode={persona ? "personalized" : "browse"}>
      <div className="has-mobile-nav-pad">
        {/* Cover */}
        <section id="home-cover" className="container-shell" style={{ scrollMarginTop: "var(--top-nav-h)", paddingTop: "1.5rem" }}>
          <div className="pui-ed-flag">
            <span className="pui-display text-lg sm:text-2xl">{translate("The Sneaker Issue")}</span>
            <span className="pui-ed-issue" suppressHydrationWarning>
              № {String(week).padStart(2, "0")} · {year}
            </span>
          </div>

          {coverShoe && (
            <div className="pui-ed-cover">
              <div>
                <p className="pui-kicker">{translate("Cover story")}</p>
                <h1 className="pui-ed-title mt-2">{coverShoe.shoe_name}</h1>
                <p className="pui-serif mt-3 max-w-[46ch] text-[rgb(var(--subtext))]">
                  {translate("Cushion, traction, court feel — the pair we'd lace up first this week.")}
                </p>
                <Link href={`/shoes/${coverShoe.slug}` as Route} className="pui-cta mt-5">
                  {translate("Read the feature")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="pui-ed-stage shoe-stage">
                <ShoeImage
                  src={coverShoe.image_url}
                  alt={coverShoe.shoe_name}
                  fallbackLabel={translate("No image")}
                  variant="detail"
                  priority
                  className="!w-[86%] !max-w-none"
                />
              </div>
            </div>
          )}
        </section>

        {/* Editor's spread: hero pick + curated shortlist */}
        {feature && (
          <section className="container-shell pui-section">
            <div className="pui-section-head">
              <span className="pui-kicker">{translate("Editor's picks")}</span>
            </div>
            <div className="pui-ed-spread">
              {/* Hero */}
              <Link href={`/shoes/${feature.slug}` as Route} prefetch className="group block">
                <div className="pui-ed-stage shoe-stage" style={{ aspectRatio: "3 / 2" }}>
                  <ShoeImage
                    src={feature.image_url}
                    alt={feature.shoe_name}
                    fallbackLabel={translate("No image")}
                    variant="detail"
                    className="!w-[82%] !max-w-none transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <p className="mt-4 pui-kicker">{translate("This week's standout")}</p>
                <h3 className="pui-ed-feature-name">{feature.shoe_name}</h3>
                <div className="mt-2 flex items-center gap-3 text-[0.82rem] text-[rgb(var(--subtext))]">
                  <span className="uppercase tracking-[0.14em]">{feature.brand}</span>
                  <StarRatingSlot value={feature.finalStars ?? null} size="sm" showNumber count={feature.userRatingCount ?? 0} />
                </div>
              </Link>

              {/* Shortlist */}
              <div>
                <div className="pui-ed-list-head">
                  <span className="pui-kicker">{translate("The shortlist")}</span>
                </div>
                {shortlist.map((s) => (
                  <Link key={s.id} href={`/shoes/${s.slug}` as Route} prefetch className="pui-ed-list-row">
                    <span className="pui-ed-thumb shoe-stage">
                      <ShoeImage
                        src={s.image_url}
                        alt={s.shoe_name}
                        fallbackLabel=""
                        variant="detail"
                        className="!w-[86%] !max-w-none !border-0"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.66rem] uppercase tracking-[0.16em] text-[rgb(var(--subtext))]">{s.brand}</span>
                      <span className="pui-ed-list-name block truncate">{s.shoe_name}</span>
                    </span>
                    <span className="num-display shrink-0 text-[0.85rem] text-[rgb(var(--pui-accent-ink))]">
                      {s.finalStars != null ? s.finalStars.toFixed(1) : "—"}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <div className="pui-section">
          <QuickPickerEntry />
        </div>

        {/* Vitrines */}
        {collections.length > 0 && (
          <section className="container-shell pui-section">
            <div className="pui-section-head">
              <span className="pui-kicker">{translate("In this issue")}</span>
            </div>
            <div className="grid gap-8">
              {collections.map((c) => {
                const items = resolveCollection(shoes, c.shoeIds).slice(0, 8);
                if (items.length === 0) return null;
                return (
                  <div key={c.id} className="min-w-0">
                    <h3 className="pui-display mb-3 text-lg">{translate(c.title)}</h3>
                    <ul className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {items.map((s, i) => (
                        <ShoeCard key={s.id} shoe={s} index={i} className="w-[160px] shrink-0" />
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* The Archive */}
        <div id="home-archive" style={{ scrollMarginTop: "var(--top-nav-h)" }} className="pui-section">
          <div className="container-shell">
            <div className="pui-section-head">
              <span className="pui-kicker">{translate("The Archive")}</span>
            </div>
          </div>
          <PremiumDatabase
            shoes={shoes}
            shoesCount={shoesCount}
            brandsCount={brandsCount}
            initialQuery={initialQuery}
            ctaLabel={translate("Open the archive")}
          />
        </div>
      </div>
    </HomeModeProvider>
  );
}
