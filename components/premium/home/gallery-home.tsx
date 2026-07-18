"use client";

// GALLERY (Obsidian) home — quiet luxury. A single line of type opens (counts as
// a footnote, no animation), then the whole catalog as a hairline index (one row
// per shoe), a text-only scene directory that reveals a preview strip on tap,
// and a pair of understated entry links. No grid, near-zero motion — restraint
// is the personality.

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { GalleryIndexList } from "@/components/premium/home/gallery-index-list";
import { useNavScrollSections } from "@/components/layout/nav-scroll-indicator";
import { useLocale } from "@/components/i18n/locale-provider";
import { resolveCollection, type PremiumHomeProps } from "@/components/premium/home/shared";

export function GalleryHome({ shoes, shoesCount, brandsCount, collections }: PremiumHomeProps) {
  const { translate } = useLocale();
  const [openScene, setOpenScene] = useState<string | null>(null);

  useNavScrollSections([
    { id: "home-index", label: translate("Index") },
    { id: "home-scenes", label: translate("Scenes") },
  ]);

  return (
    <div className="has-mobile-nav-pad container-shell">
      {/* Lede */}
      <section style={{ paddingTop: "clamp(2rem, 7vw, 4.5rem)", paddingBottom: "clamp(1.5rem, 5vw, 3rem)" }}>
        <h1 className="pui-lede" style={{ fontSize: "clamp(1.4rem, 3.4vw, 2.4rem)", maxWidth: "24ch" }}>
          {translate("A considered index of basketball sneakers.")}
        </h1>
        <p className="mt-4 text-[0.72rem] uppercase tracking-[0.24em] text-[rgb(var(--subtext))]">
          <span className="num-display">{shoesCount}</span> {translate("shoes")} · <span className="num-display">{brandsCount}</span> {translate("brands")}
        </p>
      </section>

      {/* Index */}
      <section id="home-index" style={{ scrollMarginTop: "var(--top-nav-h)", paddingBottom: "3rem" }}>
        <div className="pui-section-head">
          <span className="pui-kicker">{translate("Index")}</span>
        </div>
        <GalleryIndexList shoes={shoes} />
      </section>

      {/* Scenes */}
      {collections.length > 0 && (
        <section id="home-scenes" style={{ scrollMarginTop: "var(--top-nav-h)", paddingBottom: "3rem" }}>
          <div className="pui-section-head">
            <span className="pui-kicker">{translate("Scenes")}</span>
          </div>
          <div>
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
        <hr className="pui-hairline mb-5" />
        <div className="flex flex-wrap gap-x-8 gap-y-3 text-[0.78rem] uppercase tracking-[0.2em]">
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
