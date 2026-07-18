"use client";

// EDITORIAL (Sapphire) home — the site as a curated sneaker magazine. A serif
// masthead + "cover story" opens; below it a three-column editor's spread, a
// vitrine of scene collections, and the database recast as "The Archive",
// collapsed behind the fold. Reuses the standard data (forYou / collections /
// shoes) and sub-components (ShoeCard / ShoeImage); the personality is all
// typography + rhythm.

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { QuickPickerEntry } from "@/components/home/quick-picker-entry";
import { PremiumDatabase } from "@/components/premium/home/premium-database";
import { ShoeCard } from "@/components/home/shoe-card";
import { ShoeImage } from "@/components/shoe/shoe-image";
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

function Column({ title, shoes }: { title: string; shoes: Shoe[] }) {
  if (shoes.length === 0) return null;
  return (
    <div className="pui-ed-column">
      <h3>{title}</h3>
      <ul className="grid gap-3">
        {shoes.map((s, i) => (
          <ShoeCard key={s.id} shoe={s} index={i} />
        ))}
      </ul>
    </div>
  );
}

export function EditorialHome({ shoes, shoesCount, brandsCount, initialQuery, forYou, collections }: PremiumHomeProps) {
  const { translate } = useLocale();
  const { persona } = usePersona();

  useNavScrollSections([
    { id: "home-cover", label: translate("Cover story") },
    { id: "home-archive", label: translate("The Archive") },
  ]);

  const byId = new Map(shoes.map((s) => [s.id, s]));
  const coverShoe = resolveCollection(shoes, forYou.popular.map((s) => s.id))[0] ?? topRated(shoes, 1)[0];

  const editorPicks = topRated(shoes, 4);
  const popular = forYou.popular.map((s) => byId.get(s.id)).filter((s): s is Shoe => Boolean(s));
  const recent = forYou.recentShoes.map((s) => byId.get(s.id)).filter((s): s is Shoe => Boolean(s));
  const hasRecent = recent.length > 0;
  const continueList = hasRecent ? recent.slice(0, 4) : topRated(shoes, 8).slice(4, 8);

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

        {/* Editor's spread */}
        <section className="container-shell pui-section">
          <div className="pui-section-head">
            <span className="pui-kicker">{translate("Editor's picks")}</span>
          </div>
          <div className="pui-ed-columns">
            <Column title={translate("This week's standout")} shoes={editorPicks} />
            <Column title={translate("Popular this week")} shoes={popular} />
            <Column title={hasRecent ? translate("Continue reading") : translate("Also worth a look")} shoes={continueList} />
          </div>
        </section>

        <QuickPickerEntry />

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
                  <div key={c.id}>
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
