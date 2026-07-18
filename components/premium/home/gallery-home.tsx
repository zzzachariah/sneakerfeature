"use client";

// GALLERY (Obsidian) home — quiet luxury as a BOUTIQUE CATALOGUE (The Row / Jil
// Sander register): a restrained masthead, then the catalogue as large portrait
// plates on clean neutral grounds with generous whitespace and quiet captions.
// A text-only scene directory reveals a preview strip on tap. Every section uses
// the shared .pui-section / .pui-section-head rhythm so spacing + alignment are
// identical across the skin's pages.

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { GalleryCatalogue } from "@/components/premium/home/gallery-catalogue";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { resolveCollection, type PremiumHomeProps } from "@/components/premium/home/shared";

export function GalleryHome({ shoes, shoesCount, brandsCount, collections }: PremiumHomeProps) {
  const { translate } = useLocale();
  const [openScene, setOpenScene] = useState<string | null>(null);

  useNavScrollSections([
    { id: "home-catalogue", label: translate("Catalogue") },
    { id: "home-scenes", label: translate("Scenes") },
  ]);

  return (
    <div className="has-mobile-nav-pad container-shell">
      {/* Masthead */}
      <section style={{ paddingTop: "clamp(2.75rem, 7vw, 5rem)" }}>
        <h1 className="pui-lede" style={{ fontSize: "clamp(1.55rem, 3.6vw, 2.6rem)", maxWidth: "20ch" }}>
          {translate("A considered catalogue of basketball sneakers.")}
        </h1>
        <div className="mt-5 flex items-center gap-4 text-[0.62rem] uppercase tracking-[0.26em] text-[rgb(var(--subtext))]">
          <span><span className="num-display">{shoesCount}</span> {translate("shoes")}</span>
          <span className="opacity-40">/</span>
          <span><span className="num-display">{brandsCount}</span> {translate("brands")}</span>
        </div>
      </section>

      {/* Catalogue */}
      <section id="home-catalogue" className="pui-section" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
        <div className="pui-section-head">
          <span className="pui-kicker">{translate("Catalogue")}</span>
        </div>
        <GalleryCatalogue shoes={shoes} />
      </section>

      {/* Scenes */}
      {collections.length > 0 && (
        <section id="home-scenes" className="pui-section" style={{ scrollMarginTop: "var(--top-nav-h)" }}>
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
      <section className="pui-section" style={{ paddingBottom: "4rem" }}>
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
