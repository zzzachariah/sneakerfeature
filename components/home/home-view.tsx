"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { ForYouView } from "@/components/personalize/for-you-view";
import { HomeFeed } from "@/components/home/home-feed";
import { HomeFeedHeader } from "@/components/home/home-feed-header";
import { HomeCollections } from "@/components/home/home-collections";
import { QuickPickerEntry } from "@/components/home/quick-picker-entry";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import type { ForYouData } from "@/lib/personalize/for-you-data";
import type { HomeCollection } from "@/lib/home/collections";
import type { Shoe } from "@/lib/types";

type Props = {
  shoes: Shoe[];
  shoesCount: number;
  brandsCount: number;
  initialQuery: string;
  forYou: ForYouData;
  collections: HomeCollection[];
};

// Continuous-scroll home: For You face → curated scene rails → the database,
// which stays collapsed behind a stat block + "Browse all" so the homepage reads
// as a decision tool, not a 500-row dictionary. A search query (?q=) opens it.
export function HomeView({ shoes, shoesCount, brandsCount, initialQuery, forYou, collections }: Props) {
  const { translate } = useLocale();
  const { persona } = usePersona();
  const [browseOpen, setBrowseOpen] = useState(Boolean(initialQuery));

  useNavScrollSections([
    { id: "home-for-you", label: translate("For You") },
    { id: "home-database", label: translate("Database") }
  ]);

  return (
    <HomeModeProvider defaultMode={persona ? "personalized" : "browse"}>
      <div className="has-mobile-nav-pad">
        <section id="home-for-you" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
          <ForYouView {...forYou} />
        </section>

        <QuickPickerEntry />

        {collections.length > 0 && (
          <section id="home-collections" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
            <HomeCollections collections={collections} shoes={shoes} />
          </section>
        )}

        <section
          id="home-database"
          className="container-shell pb-10"
          style={{ scrollMarginTop: "var(--top-nav-h)" }}
        >
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
                onClick={() => setBrowseOpen(true)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 py-3 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90 active:scale-[0.99] sm:w-auto"
              >
                {translate("Browse all")} ·{" "}
                <span className="num-display">{shoesCount}</span> {translate("shoes")}
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </section>
      </div>
    </HomeModeProvider>
  );
}
