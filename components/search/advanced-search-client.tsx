"use client";

import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Shoe } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ShoeCard } from "@/components/home/shoe-card";
import { ShoeFacets } from "@/components/home/shoe-facets";
import { EmptyState } from "@/components/ui/empty-state";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useLocale } from "@/components/i18n/locale-provider";
import { rankShoeMatch } from "@/lib/search/shoe-search";
import { EMPTY_FACETS, facetCount, matchesFacets, type FacetState } from "@/lib/filters/shoe-facets";
import { haptics } from "@/lib/native/haptics";

/**
 * The "precise / advanced" search destination. Where the top-bar search is for
 * quick name lookups, this filters the whole catalog with the structured facet
 * system (Position / Era / Rating / Performance) instantly on every keystroke
 * and toggle — no page reload — and renders full ShoeCards (image, rating,
 * heart) instead of the old text-only cards. Facets live inline on desktop and
 * in a bottom sheet on mobile.
 */
export function AdvancedSearchClient({ shoes, initialQuery = "" }: { shoes: Shoe[]; initialQuery?: string }) {
  const { translate } = useLocale();
  const [q, setQ] = useState(initialQuery);
  const [facets, setFacets] = useState<FacetState>(EMPTY_FACETS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const results = useMemo(
    () =>
      shoes
        .map((shoe) => ({ shoe, score: rankShoeMatch(shoe, q) }))
        .filter(({ shoe, score }) => score >= 0 && matchesFacets(shoe, facets))
        .sort((a, b) => b.score - a.score)
        .map(({ shoe }) => shoe),
    [shoes, q, facets]
  );

  const nFacets = facetCount(facets);
  const hasQuery = q.trim().length > 0 || nFacets > 0;

  const clearAll = () => {
    setQ("");
    setFacets(EMPTY_FACETS);
  };

  return (
    <main className="container-shell space-y-5 pt-8" style={{ paddingBottom: "calc(var(--mobile-nav-h) + 2rem)" }}>
      <header>
        <p className="t-eyebrow mb-2">{translate("Advanced Search")}</p>
        <h1 className="t-display-sm" style={{ fontSize: "clamp(1.7rem, 4vw, 2.6rem)" }}>
          {translate("Filter the database")}
        </h1>
        <p className="mt-2 max-w-2xl text-sm soft-text">
          {translate(
            "Search by name, brand, player or tech, then narrow it down with structured filters. The quick search in the top bar is for fast name lookups."
          )}
        </p>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--subtext))]" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={translate("Name, brand, player, tech…")}
          aria-label={translate("Search")}
          className="pl-9"
        />
      </div>

      {/* Mobile: a filter trigger (with active count) + result count. */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <button
          type="button"
          onClick={() => {
            haptics.selection();
            setSheetOpen(true);
          }}
          className="inline-flex h-10 items-center gap-2 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-4 text-sm font-medium transition hover:border-[rgb(var(--text)/0.35)]"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {translate("Filters")}
          {nFacets > 0 ? (
            <span className="num-display inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[rgb(var(--brand))] px-1.5 text-[0.7rem] font-bold text-[rgb(var(--brand-contrast))]">
              {nFacets}
            </span>
          ) : null}
        </button>
        <p className="text-xs soft-text">
          <span className="num-display">{results.length}</span> {translate("results")}
        </p>
      </div>

      {/* Desktop: facets inline. */}
      <div className="hidden md:block">
        <ShoeFacets shoes={shoes} facets={facets} onChange={setFacets} />
      </div>
      <div className="hidden items-center justify-between md:flex">
        <p className="text-sm font-semibold">{translate("Results")}</p>
        <p className="text-xs soft-text">
          <span className="num-display">{results.length}</span> {translate("results")}
        </p>
      </div>

      {results.length === 0 ? (
        <EmptyState
          icon={Search}
          title={translate("No shoes match")}
          description={translate("Try a broader keyword or clear a filter.")}
        >
          {hasQuery ? (
            <Button variant="secondary" className="w-full rounded-xl" onClick={clearAll}>
              {translate("Clear all")}
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {results.map((shoe, i) => (
            <ShoeCard key={shoe.id} shoe={shoe} index={i} />
          ))}
        </ul>
      )}

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={translate("Filters")}>
        <ShoeFacets shoes={shoes} facets={facets} onChange={setFacets} bare />
      </BottomSheet>
    </main>
  );
}
