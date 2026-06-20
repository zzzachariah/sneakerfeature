"use client";

import { useMemo } from "react";
import type { Shoe } from "@/lib/types";
import type { HomeCollection } from "@/lib/home/collections";
import { ShoeCard } from "@/components/home/shoe-card";
import { useLocale } from "@/components/i18n/locale-provider";

// Horizontal "scene" rails between For You and the database — the導購 layer that
// turns the catalog into a few opinionated entry points.
export function HomeCollections({ collections, shoes }: { collections: HomeCollection[]; shoes: Shoe[] }) {
  const { translate } = useLocale();
  const byId = useMemo(() => new Map(shoes.map((s) => [s.id, s])), [shoes]);

  if (!collections.length) return null;

  return (
    <div className="container-shell space-y-6 py-2">
      {collections.map((collection) => {
        const items = collection.shoeIds
          .map((id) => byId.get(id))
          .filter((s): s is Shoe => Boolean(s));
        if (items.length < 4) return null;
        return (
          <section key={collection.id}>
            <h3 className="font-display mb-2 text-[0.95rem] font-semibold tracking-[-0.01em]">
              {translate(collection.title)}
            </h3>
            <ul className="chip-scroll flex gap-3 overflow-x-auto pb-2">
              {items.map((shoe) => (
                <ShoeCard key={shoe.id} shoe={shoe} className="w-[150px] shrink-0 snap-start md:w-[168px]" />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
