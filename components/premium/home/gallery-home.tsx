"use client";

// GALLERY (Obsidian) home — quiet luxury. A restrained masthead, a featured trio
// of the top-rated shoes shown as large quiet plates (the visual anchor), then
// the whole catalog as a hairline INDEX in a left-aligned reading column with
// generous right-side air. A text-only scene directory reveals a preview strip
// on tap. No dense grid, near-zero motion — restraint is the personality.

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { GalleryIndexList } from "@/components/premium/home/gallery-index-list";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { resolveCollection, topRated, type PremiumHomeProps } from "@/components/premium/home/shared";

export function GalleryHome({ shoes, shoesCount, brandsCount, collections }: PremiumHomeProps) {
  const { translate } = useLocale();
  const [openScene, setOpenScene] = useState<string | null>(null);

  useNavScrollSections([
    { id: "home-index", label: translate("Index") },
    { id: "home-scenes", label: translate("Scenes") },
  ]);

  const featured = topRated(shoes, 3);

  return (
    <div className="has-mobile-nav-pad container-shell">
      {/* Masthead */}
      <section style={{ paddingTop: "clamp(2.75rem, 7vw, 5rem)", paddingBottom: "clamp(1.75rem, 4vw, 2.75rem)" }}>
        <h1 className="pui-lede" style={{ fontSize: "clamp(1.55rem, 3.6vw, 2.6rem)", maxWidth: "20ch" }}>
          {translate("A considered index of basketball sneakers.")}
        </h1>
        <div className="mt-5 flex items-center gap-4 text-[0.64rem] uppercase tracking-[0.26em] text-[rgb(var(--subtext))]">
          <span><span className="num-display">{shoesCount}</span> {translate("shoes")}</span>
          <span className="opacity-40">/</span>
          <span><span className="num-display">{brandsCount}</span> {translate("brands")}</span>
        </div>
      </section>

      {/* Featured trio — the top-rated as large quiet plates. */}
      {featured.length >= 3 && (
        <section aria-label={translate("Featured")} style={{ paddingBottom: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-3">
            {featured.map((s, i) => (
              <Link key={s.id} href={`/shoes/${s.slug}` as Route} prefetch className="group block">
                <div className="pui-plate shoe-stage" style={{ aspectRatio: "4 / 5" }}>
                  <span className="absolute left-3 top-3 num-display text-[0.7rem] tracking-[0.1em] text-[rgb(var(--subtext))]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <ShoeImage
                    src={s.image_url}
                    alt={s.shoe_name}
                    fallbackLabel={translate("No image")}
                    variant="detail"
                    priority={i === 0}
                    className="!w-[78%] !max-w-none transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="mt-3.5">
                  <div className="pui-index-brand">{s.brand}</div>
                  <div className="mt-1 font-light tracking-[0.02em]">{s.shoe_name}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Index */}
      <section id="home-index" style={{ scrollMarginTop: "var(--top-nav-h)", paddingBottom: "clamp(2.5rem, 6vw, 4rem)" }}>
        <div className="pui-section-head">
          <span className="pui-kicker">{translate("Index")}</span>
        </div>
        <GalleryIndexList shoes={shoes} />
      </section>

      {/* Scenes */}
      {collections.length > 0 && (
        <section id="home-scenes" style={{ scrollMarginTop: "var(--top-nav-h)", paddingBottom: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="pui-section-head">
            <span className="pui-kicker">{translate("Scenes")}</span>
          </div>
          <div className="max-w-[680px]">
            {collections.map((c) => {
              const items = resolveCollection(shoes, c.shoeIds).slice(0, 6);
              const open = openScene === c.id;
              return (
                <div key={c.id}>
                  <button
                    type="button"
                    className="pui-scene-row w-full text-left"
                    aria-expanded={open}
                    onClick={() => setOpenScene(open ? null : c.id)}
                  >
                    <span className="t">{translate(c.title)}</span>
                    <span className="num-display text-[rgb(var(--subtext))]">{open ? "–" : "+"}</span>
                  </button>
                  {open && (
                    <div className="flex gap-2 overflow-x-auto py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      {items.map((s) => (
                        <Link
                          key={s.id}
                          href={`/shoes/${s.slug}` as Route}
                          className="pui-plate shoe-stage w-[130px] shrink-0"
                          aria-label={s.shoe_name}
                        >
                          <ShoeImage
                            src={s.image_url}
                            alt={s.shoe_name}
                            fallbackLabel={translate("No image")}
                            variant="detail"
                            className="!w-[82%] !max-w-none"
                          />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quiet entries */}
      <section style={{ paddingBottom: "4rem" }}>
        <hr className="pui-hairline mb-5 max-w-[680px]" />
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-[0.72rem] uppercase tracking-[0.22em]">
          <Link href={"/for-you" as Route} className="text-[rgb(var(--text))] transition-opacity hover:opacity-60">
            {translate("For You")} →
          </Link>
          <Link href={"/quick-picker" as Route} className="text-[rgb(var(--text))] transition-opacity hover:opacity-60">
            {translate("Quick Picker")} →
          </Link>
        </div>
      </section>
    </div>
  );
}
