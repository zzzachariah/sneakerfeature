"use client";

// GALLERY (Obsidian) catalogue — a boutique product grid (The Row / Jil Sander
// register): large portrait plates on clean neutral grounds, generous whitespace,
// and quiet captions (brand · name · rating). Sortable, paged. Replaces the old
// text index. Reused by the Gallery home and the Gallery favorites view.

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Shoe } from "@/lib/types";

type Sort = "rating" | "name";
const PAGE = 24;

export function GalleryCatalogue({
  shoes,
  showSort = true,
  initialSort = "rating",
  priorityCount = 3,
}: {
  shoes: Shoe[];
  showSort?: boolean;
  initialSort?: Sort;
  priorityCount?: number;
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
        <div className="mb-6 flex items-center gap-5 text-[0.62rem] uppercase tracking-[0.26em] text-[rgb(var(--subtext))]">
          <span>{translate("Sort")}</span>
          {(["rating", "name"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className="pb-0.5 transition-colors"
              style={{ color: sort === s ? "rgb(var(--text))" : undefined, borderBottom: sort === s ? "1px solid rgb(var(--text))" : "1px solid transparent" }}
            >
              {s === "rating" ? translate("Rating") : translate("Name")}
            </button>
          ))}
        </div>
      )}

      <ul className="pui-cat-grid">
        {shown.map((s, i) => (
          <li key={s.id}>
            <Link href={`/shoes/${s.slug}` as Route} prefetch className="group block">
              <div className="pui-plate shoe-stage pui-cat-plate">
                <ShoeImage
                  src={s.image_url}
                  alt={s.shoe_name}
                  fallbackLabel={translate("No image")}
                  variant="detail"
                  priority={i < priorityCount}
                  className="!w-[80%] !max-w-none !border-0 transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </div>
              <div className="pui-cat-cap">
                <span className="pui-cat-brand">{s.brand}</span>
                <span className="pui-cat-name">{s.shoe_name}</span>
                <span className="pui-cat-rating num-display">
                  {s.finalStars != null ? `★ ${s.finalStars.toFixed(1)}` : "—"}
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {visible < sorted.length && (
        <div className="mt-12 flex justify-center">
          <button type="button" onClick={() => setVisible((v) => v + PAGE)} className="pui-cta">
            {translate("Show more")}
          </button>
        </div>
      )}
    </div>
  );
}
