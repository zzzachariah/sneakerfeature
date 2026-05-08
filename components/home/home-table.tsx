"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, ChevronDown, SearchX, X } from "lucide-react";
import { Shoe } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";
import { Input } from "@/components/ui/input";
import { rankShoeMatch } from "@/lib/search/shoe-search";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";

type SortKey = "shoe_name" | "brand" | "release_year" | "rating";

export function HomeTable({
  shoes,
  initialQuery = "",
  active = true,
  scrollContainerAttr = false
}: {
  shoes: Shoe[];
  initialQuery?: string;
  active?: boolean;
  scrollContainerAttr?: boolean;
}) {
  const { translate } = useLocale();
  const [searchDraft, setSearchDraft] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [brand, setBrand] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("release_year");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(active);

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(() => setRevealed(true), 60);
    return () => window.clearTimeout(t);
  }, [active]);

  const filtered = useMemo(() => {
    const scored = shoes
      .map((shoe) => ({ shoe, score: rankShoeMatch(shoe, query) }))
      .filter(({ shoe, score }) => score >= 0 && (brand === "all" || shoe.brand === brand));

    return scored
      .sort((a, b) => {
        if (query.trim() && b.score !== a.score) return b.score - a.score;

        if (sortKey === "rating") {
          const av = a.shoe.finalStars ?? null;
          const bv = b.shoe.finalStars ?? null;
          if (av === null && bv === null) return a.shoe.shoe_name.localeCompare(b.shoe.shoe_name);
          if (av === null) return 1;
          if (bv === null) return -1;
          if (av !== bv) return sortDir === "asc" ? av - bv : bv - av;
          return a.shoe.shoe_name.localeCompare(b.shoe.shoe_name);
        }

        const av = (a.shoe[sortKey] ?? "") as string | number;
        const bv = (b.shoe[sortKey] ?? "") as string | number;
        if (av < bv) return sortDir === "asc" ? -1 : 1;
        if (av > bv) return sortDir === "asc" ? 1 : -1;
        return 0;
      })
      .map(({ shoe }) => shoe);
  }, [query, brand, shoes, sortDir, sortKey]);

  const brands = Array.from(new Set(shoes.map((s) => s.brand)));

  function toggleSort(next: SortKey) {
    if (sortKey === next) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(next);
      setSortDir("desc");
    }
  }

  function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setQuery(searchDraft);
  }

  function clearSearch() {
    setSearchDraft("");
    setQuery("");
  }

  const revealStyle = (delay: number): React.CSSProperties => ({
    opacity: revealed ? 1 : 0,
    transform: revealed ? "none" : "translateY(14px)",
    transition:
      "opacity 520ms cubic-bezier(0.22,1,0.36,1),transform 520ms cubic-bezier(0.22,1,0.36,1)",
    transitionDelay: `${delay}ms`
  });

  const rowReveal = (i: number): React.CSSProperties => {
    if (i >= 8) return {};
    return {
      opacity: revealed ? 1 : 0,
      transform: revealed ? "none" : "translateY(6px)",
      transition:
        "opacity 340ms cubic-bezier(0.22,1,0.36,1),transform 340ms cubic-bezier(0.22,1,0.36,1)",
      transitionDelay: revealed ? `${180 + i * 28}ms` : "0ms"
    };
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-5">
      <div
        className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-end md:justify-between md:gap-4"
        style={revealStyle(0)}
      >
        <div>
          <p className="t-eyebrow mb-2">{translate("The Database")}</p>
          <h2 className="t-display-sm">{translate("Every pair, indexed.")}</h2>
        </div>
        <form
          onSubmit={runSearch}
          className="flex flex-col items-stretch gap-2 md:flex-row md:items-center"
        >
          <div className="relative">
            <select
              className="h-9 w-full appearance-none rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.45)] bg-[rgb(var(--surface)/0.7)] pl-3 pr-8 text-[0.77rem] text-[rgb(var(--subtext))] outline-none transition hover:border-[rgb(var(--text)/0.35)] md:w-auto"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="all">{translate("All brands")}</option>
              {brands.map((b) => (
                <option key={b} data-brand-option="true">
                  {b}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[rgb(var(--subtext))]" />
          </div>
          <div className="relative flex-1 md:flex-initial">
            <Input
              placeholder={translate("Search 247 shoes…")}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              className="h-9 w-full pr-9 text-[0.77rem] md:w-[220px]"
            />
            {searchDraft.trim().length > 0 && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label={translate("Clear search")}
                className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[rgb(var(--subtext))] transition hover:bg-[rgb(var(--muted)/0.35)] hover:text-[rgb(var(--text))]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button type="submit" variant="secondary" className="h-9 px-3 text-[0.77rem]">
            {translate("Search")}
          </Button>
        </form>
      </div>

      <div
        className="flex-1 min-h-0 overflow-hidden rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.32)] bg-[rgb(var(--bg-elev)/0.5)]"
        style={revealStyle(120)}
      >
        <div
          className="h-full overflow-auto"
          {...(scrollContainerAttr ? { "data-home-scroll-container": "true" } : {})}
        >
          {/* Mobile card list (<md) */}
          <ul className="divide-y divide-[rgb(var(--muted)/0.18)] md:hidden">
            {filtered.length === 0 && (
              <li className="px-4 py-12 text-center soft-text">
                <div className="mx-auto flex max-w-md flex-col items-center gap-2">
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
              </li>
            )}
            {filtered.map((shoe, i) => {
              const checked = selected.includes(shoe.id);
              return (
                <li
                  key={shoe.id}
                  style={rowReveal(i)}
                  className="relative flex items-center gap-3 px-3 py-3"
                >
                  <label className="flex shrink-0 items-center">
                    <input
                      className="h-4 w-4 accent-[rgb(var(--text))]"
                      type="checkbox"
                      checked={checked}
                      aria-label={translate("Compare")}
                      onChange={(e) =>
                        setSelected((p) =>
                          e.target.checked ? [...p, shoe.id] : p.filter((id) => id !== shoe.id)
                        )
                      }
                    />
                  </label>
                  <div className="shrink-0">
                    <ShoeImage
                      src={shoe.image_url}
                      alt={shoe.shoe_name}
                      fallbackLabel={translate("No image")}
                      variant="thumbnail"
                    />
                  </div>
                  <Link
                    href={`/shoes/${shoe.slug}`}
                    className="flex min-w-0 flex-1 flex-col gap-0.5"
                  >
                    <span className="truncate text-[0.88rem] font-semibold tracking-[-0.01em]">
                      {shoe.shoe_name}
                    </span>
                    <span className="text-[0.72rem] soft-text">
                      {shoe.brand}
                      {shoe.release_year ? (
                        <>
                          <span className="mx-1.5 opacity-50">·</span>
                          {shoe.release_year}
                        </>
                      ) : null}
                    </span>
                    <span className="mt-0.5">
                      <StarRatingSlot
                        value={shoe.finalStars ?? null}
                        size="sm"
                        showNumber
                        count={shoe.userRatingCount ?? 0}
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Desktop table (md+) */}
          <table className="hidden w-full table-fixed text-left text-sm md:table">
            <colgroup>
              <col className="w-[60px]" />
              <col className="w-[88px]" />
              <col />
              <col className="w-[140px]" />
              <col className="w-[108px]" />
              <col className="w-[170px]" />
            </colgroup>
            <thead className="sticky top-0 z-10 border-b border-[rgb(var(--muted)/0.22)] bg-[rgb(var(--surface)/0.9)] text-[rgb(var(--subtext))]">
              <tr>
                <th className="px-3 py-2.5 text-center text-[0.63rem] font-medium uppercase tracking-[0.12em]">
                  {translate("Compare")}
                </th>
                <th className="px-2 py-2.5 text-center text-[0.63rem] font-medium uppercase tracking-[0.12em]">
                  {translate("Image")}
                </th>
                <th className="px-4 py-2.5 text-[0.63rem] font-medium uppercase tracking-[0.12em]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-[rgb(var(--text)/0.06)]"
                    onClick={() => toggleSort("shoe_name")}
                  >
                    {translate("Name")}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-[0.63rem] font-medium uppercase tracking-[0.12em]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-[rgb(var(--text)/0.06)]"
                    onClick={() => toggleSort("brand")}
                  >
                    {translate("Brand")}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-[0.63rem] font-medium uppercase tracking-[0.12em]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-[rgb(var(--text)/0.06)]"
                    onClick={() => toggleSort("release_year")}
                  >
                    {translate("Release")}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
                <th className="px-4 py-2.5 text-[0.63rem] font-medium uppercase tracking-[0.12em]">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-[rgb(var(--text)/0.06)]"
                    onClick={() => toggleSort("rating")}
                  >
                    {translate("Rating")}
                    <ArrowUpDown className="h-3 w-3" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center soft-text">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-2">
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
                  </td>
                </tr>
              )}
              {filtered.map((shoe, i) => {
                return (
                  <tr
                    key={shoe.id}
                    style={rowReveal(i)}
                    className="border-t border-[rgb(var(--muted)/0.15)] transition-colors duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgb(var(--text)/0.035)]"
                  >
                    <td className="px-3 py-3 text-center align-middle">
                      <input
                        className="h-4 w-4 accent-[rgb(var(--text))]"
                        type="checkbox"
                        checked={selected.includes(shoe.id)}
                        onChange={(e) =>
                          setSelected((p) =>
                            e.target.checked ? [...p, shoe.id] : p.filter((id) => id !== shoe.id)
                          )
                        }
                      />
                    </td>
                    <td className="px-2 py-3 text-center align-middle">
                      <ShoeImage
                        src={shoe.image_url}
                        alt={shoe.shoe_name}
                        fallbackLabel={translate("No image")}
                        variant="thumbnail"
                      />
                    </td>
                    <td data-field-key="shoe_name" className="px-4 py-3">
                      <Link
                        href={`/shoes/${shoe.slug}`}
                        className="font-semibold tracking-[-0.01em] transition hover:opacity-80"
                      >
                        {shoe.shoe_name}
                      </Link>
                    </td>
                    <td data-field-key="brand" className="px-4 py-3 text-[0.78rem] soft-text">
                      {shoe.brand}
                    </td>
                    <td className="px-4 py-3 text-[0.78rem] soft-text">{shoe.release_year ?? "—"}</td>
                    <td className="px-4 py-3">
                      <StarRatingSlot
                        value={shoe.finalStars ?? null}
                        size="sm"
                        showNumber
                        count={shoe.userRatingCount ?? 0}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p
        className="text-center text-[0.72rem] tracking-[0.02em] soft-text"
        style={revealStyle(320)}
      >
        {translate("Showing")} {filtered.length} {translate("of")} {shoes.length}
      </p>
      {selected.length > 1 && (
        <div className="safe-pb sticky bottom-4 flex flex-col gap-2 rounded-xl border border-[rgb(var(--text)/0.35)] bg-[rgb(var(--bg-elev)/0.92)] p-3 shadow-lift backdrop-blur-[20px] sm:flex-row sm:items-center sm:justify-between">
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
