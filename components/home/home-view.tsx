"use client";

import { useEffect, useState } from "react";
import { ForYouView } from "@/components/personalize/for-you-view";
import { HomeFeed } from "@/components/home/home-feed";
import { HomeFeedHeader } from "@/components/home/home-feed-header";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { NATIVE_HOME_SEARCH_EVENT } from "@/components/native/native-chrome";
import type { ForYouData } from "@/lib/personalize/for-you-data";
import type { Shoe } from "@/lib/types";

type Props = {
  shoes: Shoe[];
  shoesCount: number;
  brandsCount: number;
  initialQuery: string;
  forYou: ForYouData;
};

// Continuous-scroll home: For You face on top, the sneaker database below — one
// natural page scroll. When a search is active the For You face + database hero
// collapse and only the matching shoes show (a clean results view). The query is
// owned here so both the feed and the For You visibility react to it (the native
// glass search bar in the iOS app drives it via NATIVE_HOME_SEARCH_EVENT).
export function HomeView({ shoes, shoesCount, brandsCount, initialQuery, forYou }: Props) {
  const { translate } = useLocale();
  const { persona } = usePersona();
  const [query, setQuery] = useState(initialQuery);
  const searching = query.trim().length > 0;

  // The iOS native search bar relays its text as a window event.
  useEffect(() => {
    const onNativeSearch = (e: Event) => {
      const text = (e as CustomEvent<{ text: string }>).detail?.text ?? "";
      setQuery(text);
    };
    window.addEventListener(NATIVE_HOME_SEARCH_EVENT, onNativeSearch);
    return () => window.removeEventListener(NATIVE_HOME_SEARCH_EVENT, onNativeSearch);
  }, []);

  useNavScrollSections(
    searching
      ? [{ id: "home-database", label: translate("Results") }]
      : [
          { id: "home-for-you", label: translate("For You") },
          { id: "home-database", label: translate("Database") }
        ]
  );

  return (
    <HomeModeProvider defaultMode={persona ? "personalized" : "browse"}>
      <div className="has-mobile-nav-pad home-top-pad">
        {!searching && (
          <section id="home-for-you" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
            <ForYouView {...forYou} />
          </section>
        )}
        <section
          id="home-database"
          className="container-shell pb-10"
          style={{ scrollMarginTop: "var(--top-nav-h)" }}
        >
          <HomeFeed
            shoes={shoes}
            query={query}
            onQueryChange={setQuery}
            pageScroll
            scrollHeader={searching ? null : <HomeFeedHeader shoesCount={shoesCount} brandsCount={brandsCount} />}
          />
        </section>
      </div>
    </HomeModeProvider>
  );
}
