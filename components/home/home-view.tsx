"use client";

import { Fragment, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { ForYouView } from "@/components/personalize/for-you-view";
import { HomeFeed } from "@/components/home/home-feed";
import { HomeFeedHeader } from "@/components/home/home-feed-header";
import { HomeCollections } from "@/components/home/home-collections";
import { QuickPickerEntry } from "@/components/home/quick-picker-entry";
import { ClosetHomeRail } from "@/components/closet/closet-home-rail";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import type { ForYouData } from "@/lib/personalize/for-you-data";
import type { HomeCollection } from "@/lib/home/collections";
import type { Shoe } from "@/lib/types";
import { resolveHomeOrder } from "@/lib/home/sections";

type Props = {
  shoes: Shoe[];
  shoesCount: number;
  brandsCount: number;
  initialQuery: string;
  forYou: ForYouData;
  collections: HomeCollection[];
  // Member personalization: the order to render the home sections in.
  sectionOrder?: string[];
};

// Continuous-scroll home: For You face → curated scene rails → the database,
// which stays collapsed behind a stat block + "Browse all" so the homepage reads
// as a decision tool, not a 500-row dictionary. A search query (?q=) opens it.
export function HomeView({ shoes, shoesCount, brandsCount, initialQuery, forYou, collections, sectionOrder }: Props) {
  const { translate } = useLocale();
  const { persona } = usePersona();
  const [browseOpen, setBrowseOpen] = useState(Boolean(initialQuery));

  useNavScrollSections([
    { id: "home-for-you", label: translate("For You") },
    { id: "home-database", label: translate("Database") }
  ]);

  // Member-personalized section order (defaults to the canonical order).
  const order = resolveHomeOrder(sectionOrder);
  const blocks: Record<string, ReactNode> = {
    "for-you": (
      <>
        <section id="home-for-you" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
          <ForYouView {...forYou} shoesCount={shoesCount} brandsCount={brandsCount} />
        </section>
        <QuickPickerEntry />
      </>
    ),
    closet: (
      <section id="home-closet" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
        <ClosetHomeRail shoes={shoes} />
      </section>
    ),
    collections:
      collections.length > 0 ? (
        <section id="home-collections" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
          <HomeCollections collections={collections} shoes={shoes} />
        </section>
      ) : null,
    database: (
      <section id="home-database" className="container-shell pb-10" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
        {browseOpen ? (
          <HomeFeed
            shoes={shoes}
            initialQuery={initialQuery}
            pageScroll
            scrollHeader={<HomeFeedHeader shoesCount={shoesCount} brandsCount={brandsCount} />}
            onCollapse={() => setBrowseOpen(false)}
          />
        ) : (
          <div>
            <HomeFeedHeader shoesCount={shoesCount} brandsCount={brandsCount} />
            <button
              type="button"
              onClick={() => {
                setBrowseOpen(true);
                // Give the expand real feedback: bring the freshly-revealed
                // grid to the top of the viewport (it otherwise replaces the
                // button in place and reads as "nothing happened" on desktop).
                setTimeout(
                  () => document.getElementById("home-database")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                  60
                );
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 py-3 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90 active:scale-[0.99] sm:w-auto"
            >
              {translate("Browse all")} ·{" "}
              <span className="num-display">{shoesCount}</span> {translate("shoes")}
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </section>
    )
  };

  return (
    <HomeModeProvider defaultMode={persona ? "personalized" : "browse"}>
      <div className="has-mobile-nav-pad">
        {order.map((id) => (
          <Fragment key={id}>{blocks[id]}</Fragment>
        ))}
      </div>
    </HomeModeProvider>
  );
}
