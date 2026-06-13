"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { ChevronDown, SearchX, X } from "lucide-react";
import { Shoe } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/components/i18n/locale-provider";
import { rankShoeMatch } from "@/lib/search/shoe-search";
import { ShoeCard } from "@/components/home/shoe-card";
import { usePersona } from "@/components/preferences/persona-provider";
import { computeMatchScore, getMatchReasons, spreadTiedScores } from "@/lib/match/score";
import { useHomeMode } from "@/components/home/home-mode-context";

export function HomeFeed({
  shoes,
  initialQuery = "",
  active = true,
  scrollContainerAttr = false,
  scrollHeader
}: {
  shoes: Shoe[];
  initialQuery?: string;
  active?: boolean;
  scrollContainerAttr?: boolean;
  scrollHeader?: ReactNode;
}) {
  const { translate } = useLocale();
  const { persona, isLoggedIn, openModal } = usePersona();
  const { mode, setMode } = useHomeMode();
  const [searchDraft, setSearchDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [brand, setBrand] = useState("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [compareMode, setCompareMode] = useState(false);
  const [revealed, setRevealed] = useState(active);

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
      .filter(({ shoe, searchScore }) => searchScore >= 0 && (brand === "all" || shoe.brand === brand));

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
  }, [scored, query, brand, mode]);

  const brands = Array.from(new Set(shoes.map((s) => s.brand)));

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

  const revealStyle = (delay: number): React.CSSProperties => ({
    opacity: revealed ? 1 : 0,
    transform: revealed ? "none" : "translateY(14px)",
    transition: "opacity 520ms cubic-bezier(0.22,1,0.36,1),transform 520ms cubic-bezier(0.22,1,0.36,1)",
    transitionDelay: `${delay}ms`
  });

  const personalizedDisabled = !persona;

  return (
    <section className="flex h-full min-h-0 flex-col gap-4" data-tutorial="home-feed">
      <div
        className="flex flex-col items-stretch gap-2 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4"
        style={revealStyle(0)}
      >
        <div className="hidden md:block">
          <p className="t-eyebrow mb-2">{translate("Your personalized feed")}</p>
          <h2 className="t-display-sm">{translate("Sneaker Database")}</h2>
        </div>
        <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
          <div
            className="hidden md:inline-flex overflow-hidden rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)]"
            data-tutorial="home-mode-toggle"
          >
            <button
              type="button"
              onClick={() => setMode("browse")}
              className="px-3 py-1.5 text-[0.78rem] font-medium transition"
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
              className="border-l border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 py-1.5 text-[0.78rem] font-medium transition disabled:cursor-not-allowed disabled:opacity-50"
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
            <div className="relative hidden md:block">
              <select
                className="h-9 w-auto appearance-none rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.45)] bg-[rgb(var(--surface)/0.7)] pl-3 pr-8 text-[0.77rem] text-[rgb(var(--subtext))] outline-none transition hover:border-[rgb(var(--text)/0.35)]"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              >
                <option value="all">{translate("All brands")}</option>
                {brands.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--subtext))]" />
            </div>
            <div className="relative flex-1 md:flex-initial" data-tutorial="home-feed-search">
              <Input
                placeholder={translate("Search shoes…")}
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                className="h-10 w-full pr-9 md:h-9 md:w-[220px] md:text-[0.77rem]"
              />
              {searchDraft.trim().length > 0 && (
                <button
                  type="button"
                  onClick={clearSearch}
                  aria-label={translate("Clear search")}
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[rgb(var(--subtext))] transition hover:bg-[rgb(var(--muted)/0.35)] hover:text-[rgb(var(--text))] md:h-6 md:w-6"
                >
                  <X className="h-4 w-4 md:h-3.5 md:w-3.5" />
                </button>
              )}
            </div>
            <Button
              type="submit"
              variant="secondary"
              className="h-10 px-3 text-sm md:h-9 md:px-3 md:text-[0.77rem]"
            >
              {translate("Search")}
            </Button>
            <button
              type="button"
              onClick={() => {
                setCompareMode((v) => {
                  if (v) setSelected([]);
                  return !v;
                });
              }}
              className={`hidden md:inline-flex h-9 items-center justify-center rounded-md border px-3 text-[0.77rem] font-medium leading-none transition ${
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
                  className="hidden md:inline-flex h-9 items-center justify-center rounded-md border border-[rgb(var(--text))] bg-[rgb(var(--text))] px-3 text-[0.77rem] font-semibold leading-none text-[rgb(var(--bg))] transition hover:opacity-90"
                >
                  {translate("Compare")} ({selected.length})
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="hidden md:inline-flex h-9 cursor-not-allowed items-center justify-center rounded-md border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.77rem] font-medium leading-none text-[rgb(var(--subtext))] opacity-60"
                >
                  {translate("Compare")}
                  {selected.length === 1 ? ` (${selected.length})` : ""}
                </span>
              ))}
          </form>
        </div>
      </div>

      <div
        className="min-h-0 flex-1 overflow-hidden rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.32)] bg-[rgb(var(--bg-elev)/0.4)]"
        style={revealStyle(120)}
      >
        <div
          className="h-full overflow-auto p-3"
          {...(scrollContainerAttr ? { "data-home-scroll-container": "true" } : {})}
        >
          {scrollHeader}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center soft-text">
              <SearchX className="h-5 w-5" />
              <p>{translate("No sneakers match this search.")}</p>
              <button
                type="button"
                onClick={() => {
                  setSearchDraft("");
                  setQuery("");
                  setBrand("all");
                }}
                className="text-xs text-[rgb(var(--text))] underline-offset-2 hover:underline"
              >
                {translate("Clear filters")}
              </button>
            </div>
          ) : (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {filtered.map(({ shoe, score, reasons }) => (
                <ShoeCard
                  key={shoe.id}
                  shoe={shoe}
                  matchScore={mode === "personalized" ? score : null}
                  reasons={mode === "personalized" ? reasons : []}
                  compareEnabled={compareMode}
                  selected={selected.includes(shoe.id)}
                  onToggleSelect={() => toggleSelect(shoe.id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="text-center text-[0.72rem] tracking-[0.02em] soft-text" style={revealStyle(320)}>
        {translate("Showing")} {filtered.length} {translate("of")} {shoes.length}
      </p>

      {compareMode && selected.length > 1 && (
        <div
          className="sticky flex flex-col gap-2 rounded-xl border border-[rgb(var(--text)/0.35)] bg-[rgb(var(--bg-elev)/0.92)] p-3 shadow-lift backdrop-blur-[20px] sm:flex-row sm:items-center sm:justify-between md:hidden"
          style={{ bottom: "calc(var(--mobile-nav-h, 0px) + 16px)" }}
        >
          <p className="text-sm">
            {selected.length} {translate("shoes selected for compare")}
          </p>
          <Link href={`/compare?ids=${selected.join(",")}`} className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">{translate("Compare now")}</Button>
          </Link>
        </div>
      )}
    </section>
  );
}
