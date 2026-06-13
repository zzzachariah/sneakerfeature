"use client";

import { ForYouView } from "@/components/personalize/for-you-view";
import { HomeFeed } from "@/components/home/home-feed";
import { HomeFeedHeader } from "@/components/home/home-feed-header";
import { HomeModeProvider } from "@/components/home/home-mode-context";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
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
// natural page scroll (no slide deck). The navbar shows a two-stop indicator.
export function HomeView({ shoes, shoesCount, brandsCount, initialQuery, forYou }: Props) {
  const { translate } = useLocale();
  const { persona } = usePersona();

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
        <section
          id="home-database"
          className="container-shell pb-10"
          style={{ scrollMarginTop: "var(--top-nav-h)" }}
        >
          <HomeFeed
            shoes={shoes}
            initialQuery={initialQuery}
            pageScroll
            scrollHeader={<HomeFeedHeader shoesCount={shoesCount} brandsCount={brandsCount} />}
          />
        </section>
      </div>
    </HomeModeProvider>
  );
}
