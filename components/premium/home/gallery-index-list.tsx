"use client";

// GALLERY (Obsidian) index — the grid replaced by one row per shoe (D3). Brand,
// name and rating on hairline-separated lines; sortable by rating or name. Long
// lists page in ("show more") so 500+ rows never mount at once. Reused by the
// Gallery home and the Gallery favorites view.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Shoe } from "@/lib/types";

type Sort = "rating" | "name";
const PAGE = 120;

export function GalleryIndexList({
  shoes,
  showSort = true,
  initialSort = "rating",
}: {
  shoes: Shoe[];
  showSort?: boolean;
  initialSort?: Sort;
}) {
  const { translate } = useLocale();
  const [sort, setSort] = useState<Sort>(initialSort);
  const [visible, setVisible] = useState(PAGE);

  const sorted = useMemo(() => {
    const list = [...shoes];
    if (sort === "name") list.sort((a, b) => a.shoe_name.localeCompare(b.shoe_name));
    else list.sort((a, b) => (b.finalStars ?? 0) - (a.finalStars ?? 0));
    return list;
  }, [shoes, sort]);

  const shown = sorted.slice(0, visible);

  return (
    <div>
      {showSort && (
        <div className="mb-3 flex items-center gap-4 text-[0.7rem] uppercase tracking-[0.18em] text-[rgb(var(--subtext))]">
          <span>{translate("Sort")}</span>
          {(["rating", "name"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className="transition-colors"
              style={{ color: sort === s ? "rgb(var(--text))" : undefined, borderBottom: sort === s ? "1px solid rgb(var(--text))" : "1px solid transparent" }}
            >
              {s === "rating" ? translate("Rating") : translate("Name")}
            </button>
          ))}
        </div>
      )}

      <ul className="pui-index">
        {shown.map((s) => (
          <li key={s.id}>
            <Link href={`/shoes/${s.slug}` as Route} prefetch className="pui-index-row">
              <span className="min-w-0">
                <span className="pui-index-brand block">{s.brand}</span>
                <span className="pui-index-name block truncate">{s.shoe_name}</span>
              </span>
              <span className="pui-index-score num-display self-center whitespace-nowrap">
                {s.finalStars != null ? `★ ${s.finalStars.toFixed(1)}` : "—"}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {visible < sorted.length && (
        <div className="mt-6 flex justify-center">
          <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="pui-cta">
            {translate("Show more")}
          </button>
        </div>
      )}
    </div>
  );
}
