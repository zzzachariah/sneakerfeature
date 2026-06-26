"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import React, { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { ChevronUp, Search, SearchX, SlidersHorizontal, X } from "lucide-react";
import { Shoe } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { useLocale } from "@/components/i18n/locale-provider";
import { rankShoeMatch } from "@/lib/search/shoe-search";
import { ShoeCard } from "@/components/home/shoe-card";
import { useLocalShoes } from "@/lib/local/use-local-shoes";
import { usePersona } from "@/components/preferences/persona-provider";
import { computeMatchScore, getMatchReasons, spreadTiedScores } from "@/lib/match/score";
import { useHomeMode } from "@/components/home/home-mode-context";
import { ShoeFacets } from "@/components/home/shoe-facets";
import {
  EMPTY_FACETS,
  facetCount,
  buildFacetIndex,
  matchesIndexed,
  type FacetState
} from "@/lib/filters/shoe-facets";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { FeedFab } from "@/components/home/feed-fab";
import { useIsIosNative } from "@/lib/hooks/use-is-ios-native";

function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(mq.matches);
    const h = (e: MediaQueryListEvent) => setR(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return r;
}

// Initial paint window. Once the user scrolls anywhere near the bottom,
// we jump straight to rendering the WHOLE filtered list so fast flicks
// never outrun progressive batches — see the IntersectionObserver below.
const INITIAL_VISIBLE = 96;

// Tracks the phone breakpoint so filters open as a native-feeling bottom sheet on
// phones and stay as an inline panel on desktop. Defaults to false (desktop) for
// SSR; resolves after mount (filters are closed initially, so no visible jump).
function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return mobile;
}

export function HomeFeed({
  shoes: initialShoes,
  initialQuery = "",
  active = true,
  scrollContainerAttr = false,
  pageScroll = false,
  scrollHeader,
  onCollapse
}: {
  shoes: Shoe[];
  initialQuery?: string;
  active?: boolean;
  scrollContainerAttr?: boolean;
  /** When true, the feed flows in the page scroll (no internal scroll area);
      the filter bar pins under the navbar instead of the container top. */
  pageScroll?: boolean;
  scrollHeader?: ReactNode;
  /** When provided, a floating control to collapse the feed appears (home). */
  onCollapse?: () => void;
}) {
  const { translate } = useLocale();
  const { persona, isLoggedIn, openModal } = usePersona();
  const { mode, setMode } = useHomeMode();
  const { favorites } = useFavorites();
  const { signedIn } = useAuthState();
  const router = useRouter();
  const pathname = usePathname();
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [fabVisible, setFabVisible] = useState(false);
  // Render the SSR list (keeps personalization); keep an offline IndexedDB copy
  // of the public catalog in sync, and fall back to it when there's no server data.
  const shoes = useLocalShoes(initialShoes);
  // Precompute facet data (incl. the regex-scored performance flags) once per
  // catalog, so filtering stays cheap on every keystroke / facet toggle.
  const facetIndex = useMemo(() => buildFacetIndex(shoes), [shoes]);
  const [searchDraft, setSearchDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [brand, setBrand] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [revealed, setRevealed] = useState(active);
  const [facets, setFacets] = useState<FacetState>(EMPTY_FACETS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const activeFacetCount = facetCount(facets);
  const isMobile = useIsMobile();
  // iOS-app only: collapse the search/filter toolbar by default, expose a
  // glassy "Browse all shoes" entry pill that expands it, and a "Collapse"
  // button to fold it back. Web and Android are unaffected — `isIosNative`
  // starts false (so SSR / first paint matches web) and flips on mount inside
  // the Capacitor iOS shell. iPad / large iOS keeps the desktop toolbar (the
  // entry pill is `md:hidden` and the toolbar bar still lays out at md+), so
  // we additionally gate on `isMobile` to make iPad behave like desktop.
  const isIosNative = useIsIosNative();
  const collapseEnabled = isIosNative && isMobile;
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolbarVisible = !collapseEnabled || toolsOpen;

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setRevealed(true), 60);
    return () => window.clearTimeout(t);
  }, [active]);

  const scored = useMemo(() => {
    const base = shoes.map((shoe) => ({
      shoe,
      score: persona ? computeMatchScore(persona, shoe) : null,
      reasons: persona ? getMatchReasons(persona, shoe) : []
    }));
    if (!persona) return base;

    // Spread tied scores across the full catalog so the score shown for a shoe
    // is stable regardless of the active brand/search filter.
    const ranked = base
      .filter((e): e is { shoe: Shoe; score: number; reasons: string[] } => e.score != null)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const av = a.shoe.finalStars ?? -1;
        const bv = b.shoe.finalStars ?? -1;
        if (bv !== av) return bv - av;
        return a.shoe.shoe_name.localeCompare(b.shoe.shoe_name);
      })
      .map((e) => ({ id: e.shoe.id, score: e.score }));

    const spread = spreadTiedScores(ranked);
    return base.map((e) => ({
      ...e,
      score: e.score != null ? spread.get(e.shoe.id) ?? e.score : null
    }));
  }, [shoes, persona]);

  const filtered = useMemo(() => {
    const list = scored
      .map((entry) => ({ ...entry, searchScore: rankShoeMatch(entry.shoe, query) }))
      .filter(
        ({ shoe, searchScore }) =>
          searchScore >= 0 &&
          (brand === "all" || shoe.brand === brand) &&
          (!onlyFavorites || favorites.has(shoe.id)) &&
          matchesIndexed(facetIndex.get(shoe.id), facets)
      );

    return list.sort((a, b) => {
      if (query.trim() && b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
      if (mode === "personalized" && a.score != null && b.score != null && a.score !== b.score) {
        return b.score - a.score;
      }
      const av = a.shoe.finalStars ?? null;
      const bv = b.shoe.finalStars ?? null;
      if (av === null && bv === null) return a.shoe.shoe_name.localeCompare(b.shoe.shoe_name);
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av !== bv) return bv - av;
      return a.shoe.shoe_name.localeCompare(b.shoe.shoe_name);
    });
  }, [scored, query, brand, mode, facets, facetIndex, onlyFavorites, favorites]);

  // Floating feed control: appears once the player has scrolled down into the
  // list (home only). Threshold-based so it's stable, not flickery.
  useEffect(() => {
    if (!onCollapse) return;
    const onScroll = () => setFabVisible(window.scrollY > 320);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [onCollapse]);

  function onToggleFavorites() {
    if (!signedIn) {
      router.push(`/login?next=${encodeURIComponent(pathname)}` as Route);
      return;
    }
    setOnlyFavorites((v) => !v);
  }

  const brands = Array.from(new Set(shoes.map((s) => s.brand)));

  // Progressive rendering: reset the window whenever the result set changes.
  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [query, brand, mode, facets]);

  // Grow the window as the sentinel nears the viewport. Re-runs on each grow so
  // it keeps filling until the sentinel leaves range or every shoe is shown;
  // falls back to rendering everything where IntersectionObserver is missing, so
  // nothing is ever hidden.
  useEffect(() => {
    if (visibleCount >= filtered.length) return;
    const node = sentinelRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisibleCount(filtered.length);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          // Jump straight to the full result set on first sentinel hit so
          // fast scrolls never outrun the progressive batches.
          setVisibleCount(filtered.length);
        }
      },
      { rootMargin: "3200px 0px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [visibleCount, filtered.length]);

  function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setQuery(searchDraft);
  }
  function clearSearch() {
    setSearchDraft("");
    setQuery("");
  }

  function toggleSelect(id: string) {
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const revealStyle = (delay: number): React.CSSProperties =>
    reduce
      ? { opacity: 1, transform: "none" }
      : ({
          opacity: revealed ? 1 : 0,
          transform: revealed ? "none" : "translateY(14px)",
          transition: "opacity 320ms var(--ease), transform 320ms var(--ease)",
          transitionDelay: `${delay}ms`
        });

  const reduce = useReducedMotion();
  const personalizedDisabled = !persona;

  return (
    <section className={pageScroll ? "flex flex-col" : "flex h-full min-h-0 flex-col"} data-tutorial="home-feed">
      <div
        className={pageScroll ? "" : "min-h-0 flex-1 overflow-auto px-3 pb-3"}
        {...(scrollContainerAttr && !pageScroll ? { "data-home-scroll-container": "true" } : {})}
      >
        {scrollHeader}
        <div
          className={
            pageScroll
              ? // Flush to the container-shell edges so the search field + button
                // line up with the navbar's logo (left) and hamburger/account
                // (right). On phones the field + button float on their own pill
                // backgrounds — NO full-width frosted band wrapping them (it read
                // as an ugly rectangle). The desktop filter bar keeps its bar.
                "sticky top-[var(--top-nav-h)] z-30 mb-3 py-2 md:-mx-[var(--container-gutter)] md:px-[var(--container-gutter)] md:border-b md:border-[rgb(var(--glass-stroke-soft)/0.55)] md:bg-[rgb(var(--bg)/0.66)] md:backdrop-blur-[var(--glass-blur-md)] md:backdrop-saturate-[var(--glass-saturate)]"
              : "sticky top-0 z-10 -mx-3 mb-3 px-3 py-2 md:border-b md:border-[rgb(var(--glass-stroke-soft)/0.55)] md:bg-[rgb(var(--bg)/0.66)] md:backdrop-blur-[var(--glass-blur-md)] md:backdrop-saturate-[var(--glass-saturate)]"
          }
          style={revealStyle(0)}
        >
        {collapseEnabled && !toolsOpen && (
          <button
            type="button"
            onClick={() => setToolsOpen(true)}
            aria-expanded={false}
            className="glass glass-rim glass-clip glass-interactive relative flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]"
          >
            <Search className="h-4 w-4" />
            {translate("Browse all shoes")}
          </button>
        )}
        {collapseEnabled && toolsOpen && (
          // Floating collapse pill: pinned to the sticky toolbar's top-right
          // corner so it stays visible as the user scrolls. The toolbar wrapper
          // reserves right padding so the Filters / Search button doesn't sit
          // under it.
          <button
            type="button"
            onClick={() => setToolsOpen(false)}
            aria-label={translate("Collapse")}
            className="glass glass-rim glass-clip glass-interactive absolute right-2 top-1.5 z-30 inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] md:right-[calc(var(--container-gutter)+0.5rem)]"
          >
            <ChevronUp className="h-4 w-4" />
          </button>
        )}
        <div
          className={`flex flex-col items-stretch gap-2 md:flex-row md:items-center md:justify-end${
            collapseEnabled && toolsOpen ? " pr-12" : ""
          }`}
          style={toolbarVisible ? undefined : { display: "none" }}
        >
          <div
            role="group"
            aria-label={translate("Feed mode")}
            className="hidden md:inline-flex overflow-hidden rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)]"
            data-tutorial="home-mode-toggle"
          >
            <button
              type="button"
              onClick={() => setMode("browse")}
              aria-pressed={mode === "browse"}
              className="px-3 py-1.5 text-[0.78rem] font-medium transition hover:bg-[rgb(var(--text)/0.06)] focus-visible:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--text)/0.25)]"
              style={{
                background: mode === "browse" ? "rgb(var(--text)/0.92)" : "transparent",
                color: mode === "browse" ? "rgb(var(--bg))" : "rgb(var(--subtext))"
              }}
            >
              {translate("Browse all")}
            </button>
            <button
              type="button"
              onClick={() => {
                if (personalizedDisabled) {
                  if (isLoggedIn) openModal();
                  return;
                }
                setMode("personalized");
              }}
              disabled={personalizedDisabled && !isLoggedIn}
              aria-pressed={mode === "personalized"}
              aria-disabled={personalizedDisabled}
              className="border-l border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 py-1.5 text-[0.78rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[rgb(var(--text)/0.06)] focus-visible:outline-none focus-visible:relative focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[rgb(var(--text)/0.25)]"
              style={{
                background: mode === "personalized" ? "rgb(var(--text)/0.92)" : "transparent",
                color: mode === "personalized" ? "rgb(var(--bg))" : "rgb(var(--subtext))"
              }}
              title={personalizedDisabled ? translate("Log in to personalize") : undefined}
            >
              {translate("Personalized")}
            </button>
          </div>
          <form
            onSubmit={runSearch}
            className="flex flex-row items-center gap-2 md:flex-row md:items-center"
          >
            <Select
              wrapperClassName="hidden md:block"
              className="md:w-auto md:text-[0.78rem]"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="all">{translate("All brands")}</option>
              {brands.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </Select>
            <div className="relative flex-1 md:flex-initial" data-tutorial="home-feed-search">
              <Input
                placeholder={translate("Search shoes…")}
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="h-11 w-full rounded-full bg-[rgb(var(--surface)/0.82)] pr-9 shadow-[0_6px_20px_rgb(var(--shadow)/0.18)] backdrop-blur-[16px] md:h-9 md:w-[220px] md:rounded-lg md:text-[0.78rem] md:shadow-none ios-glass-search-pill"
              />
              {searchDraft.trim().length > 0 && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label={translate("Clear search")}
                  className="tap-44 absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[rgb(var(--subtext))] transition hover:bg-[rgb(var(--muted)/0.35)] hover:text-[rgb(var(--text))] md:h-6 md:w-6"
                >
                  <X className="h-4 w-4 md:h-3.5 md:w-3.5" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              variant="secondary"
              className="h-11 rounded-full px-4 text-sm shadow-[0_6px_20px_rgb(var(--shadow)/0.18)] backdrop-blur-[16px] md:h-9 md:rounded-lg md:px-3 md:text-[0.78rem] md:shadow-none"
            >
              {translate("Search")}
            </Button>
            <button
              type="button"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              className={`inline-flex h-11 items-center justify-center gap-1.5 rounded-full border px-3.5 text-sm font-medium leading-none transition md:h-9 md:rounded-lg md:px-3 md:text-[0.78rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] ${
                filtersOpen || activeFacetCount > 0
                  ? "bg-[rgb(var(--brand)/0.08)] border-[rgb(var(--brand)/0.6)] text-[rgb(var(--brand))]"
                  : "border-[rgb(var(--glass-stroke-soft)/0.55)] text-[rgb(var(--subtext))] hover:border-[rgb(var(--text)/0.35)] hover:text-[rgb(var(--text))]"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4 md:h-3.5 md:w-3.5" />
              {translate("Filters")}
              {activeFacetCount > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[rgb(var(--brand))] px-1 text-[0.62rem] font-semibold tabular-nums text-[rgb(var(--brand-contrast))]">
                  {activeFacetCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setCompareMode((v) => {
                  if (v) setSelected([]);
                  return !v;
                });
              }}
              className={`hidden md:inline-flex h-9 items-center justify-center rounded-md border px-3 text-[0.78rem] font-medium leading-none transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] ${
                compareMode
                  ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                  : "border-[rgb(var(--glass-stroke-soft)/0.55)] text-[rgb(var(--subtext))] hover:border-[rgb(var(--text)/0.35)]"
              }`}
            >
              {translate("Compare mode")}
            </button>
            {compareMode &&
              (selected.length > 1 ? (
                <Link
                  href={`/compare?ids=${selected.join(",")}`}
                  className="hidden md:inline-flex h-9 items-center justify-center rounded-md border border-[rgb(var(--text))] bg-[rgb(var(--text))] px-3 text-[0.78rem] font-semibold leading-none text-[rgb(var(--bg))] transition hover:opacity-90"
                >
                  {translate("Compare")} ({selected.length})
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="hidden md:inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.78rem] font-medium leading-none text-[rgb(var(--subtext)/0.7)]"
                >
                  {translate("Compare")}
                  {selected.length === 1 ? ` (${selected.length})` : ""}
                </span>
              ))}
          </form>
        </div>
        </div>

          {/* Desktop: inline filter panel. Phone bottom sheet is rendered outside
              the scroll container (below) so iOS fixed-position layering works. */}
          {filtersOpen && !isMobile && (
            <ShoeFacets shoes={shoes} facets={facets} onChange={setFacets} />
          )}

          {filtered.length === 0 ? (
            <div className="surface-card premium-border mx-auto mt-4 flex max-w-sm flex-col items-center gap-3 rounded-2xl p-8 text-center">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)]">
                <SearchX className="h-6 w-6 text-[rgb(var(--subtext))]" aria-hidden />
              </span>
              <p className="text-sm font-medium text-[rgb(var(--text))]">{translate("No sneakers match this search.")}</p>
              <p className="text-xs soft-text">{translate("Try broader keywords or remove one filter.")}</p>
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  setQuery("");
                  setBrand("all");
                  setFacets(EMPTY_FACETS);
                  setOnlyFavorites(false);
                }}
                className="mt-1 inline-flex min-h-[44px] items-center rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] px-4 text-sm font-medium tracking-[-0.01em] text-[rgb(var(--text))] transition hover:border-[rgb(var(--text)/0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.2)] md:min-h-[36px]"
              >
                {translate("Clear filters")}
              </button>
            </div>
          ) : (
            <>
              <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {filtered.slice(0, visibleCount).map(({ shoe, score }, index) => (
                  <ShoeCard
                    key={shoe.id}
                    shoe={shoe}
                    index={index}
                    // No queue stagger and a wide rootMargin: each card
                    // fades in on its own, and the IntersectionObserver
                    // trips ~800px before the card enters the viewport so
                    // fast scrolls never see opacity-0 placeholders.
                    revealStagger={0}
                    revealRootMargin="800px 0px"
                    priority={index < 16}
                    matchScore={mode === "personalized" ? score : null}
                    showChips={mode === "personalized"}
                    compareEnabled={compareMode}
                    selected={selected.includes(shoe.id)}
                    onToggleSelect={() => toggleSelect(shoe.id)}
                  />
                ))}
              </ul>
              {visibleCount < filtered.length && (
                <div ref={sentinelRef} aria-hidden className="h-6 w-full" />
              )}
            </>
          )}

      {filtered.length > 0 && (
        <p className="mt-4 text-center text-[0.72rem] tracking-[0.02em] tabular-nums soft-text" style={revealStyle(320)}>
          {translate("Showing")} {filtered.length} {translate("of")} {shoes.length}
        </p>
      )}
      </div>

      {/* Phone filter sheet — rendered outside overflow-auto so position:fixed
          works correctly on iOS Capacitor (the overflow container otherwise
          intercepts touch events before they reach the backdrop). */}
      {isMobile && (
        <BottomSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">
          <ShoeFacets shoes={shoes} facets={facets} onChange={setFacets} bare />
          <div className="mt-5">
            <Button className="w-full" onClick={() => setFiltersOpen(false)}>
              {translate("Show results")} · {filtered.length}
            </Button>
          </div>
        </BottomSheet>
      )}

      {compareMode && selected.length > 1 && (
        <div
          className="glass-strong glass-rim glass-clip sticky flex flex-col gap-2 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between md:hidden"
          style={{ bottom: "calc(var(--mobile-nav-h, 0px) + 20px)" }}
        >
          <p className="text-sm">
            {selected.length} {translate("shoes selected for compare")}
          </p>
          <Link href={`/compare?ids=${selected.join(",")}`} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">{translate("Compare now")}</Button>
          </Link>
        </div>
      )}

      {onCollapse && (
        <FeedFab
          visible={fabVisible && !(compareMode && selected.length > 1)}
          compareMode={compareMode}
          onlyFavorites={onlyFavorites}
          onCollapse={onCollapse}
          onToggleCompare={() =>
            setCompareMode((v) => {
              if (v) setSelected([]);
              return !v;
            })
          }
          onToggleFavorites={onToggleFavorites}
        />
      )}
    </section>
  );
}
