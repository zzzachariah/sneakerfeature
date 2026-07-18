"use client";

// The database block, shared by the Editorial / Instrument / Arena home variants.
// Mirrors HomeView's database section (collapsed behind a "browse all" button,
// expands to the full HomeFeed; a ?q= query opens it) but lets each skin decide
// the default-open state and the CTA copy. Gallery does NOT use this — it shows
// its own one-row-per-shoe index instead.
//
// Must be rendered inside a HomeModeProvider (the variant wraps the whole page),
// because HomeFeed reads useHomeMode().

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { HomeFeed } from "@/components/home/home-feed";
import { HomeFeedHeader } from "@/components/home/home-feed-header";
import { useLocale } from "@/components/i18n/locale-provider";

export function PremiumDatabase({
  shoes,
  shoesCount,
  brandsCount,
  initialQuery,
  defaultOpen = false,
  ctaLabel,
}: {
  shoes: import("@/lib/types").Shoe[];
  shoesCount: number;
  brandsCount: number;
  initialQuery: string;
  defaultOpen?: boolean;
  ctaLabel?: string;
}) {
  const { translate } = useLocale();
  const [open, setOpen] = useState(defaultOpen || Boolean(initialQuery));

  return (
    <section id="home-database" className="container-shell pb-12" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
      {open ? (
        <HomeFeed
          shoes={shoes}
          initialQuery={initialQuery}
          pageScroll
          scrollHeader={<HomeFeedHeader shoesCount={shoesCount} brandsCount={brandsCount} />}
          onCollapse={defaultOpen ? undefined : () => setOpen(false)}
        />
      ) : (
        <div>
          <HomeFeedHeader shoesCount={shoesCount} brandsCount={brandsCount} />
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setTimeout(
                () => document.getElementById("home-database")?.scrollIntoView({ behavior: "smooth", block: "start" }),
                60
              );
            }}
            className="pui-cta mt-3 w-full sm:w-auto"
          >
            {ctaLabel ?? translate("Browse all")} · <span className="num-display">{shoesCount}</span> {translate("shoes")}
            <ChevronDown className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
