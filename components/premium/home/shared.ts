// Shared types + helpers for the premium home variants. Each variant is handed
// the exact same props app/page.tsx already builds for HomeView (a superset that
// covers every variant), so switching skins is a pure client-side render swap —
// no extra server query.

import type { Shoe } from "@/lib/types";
import type { ForYouData } from "@/lib/personalize/for-you-data";
import type { HomeCollection } from "@/lib/home/collections";

export type PremiumHomeProps = {
  shoes: Shoe[];
  shoesCount: number;
  brandsCount: number;
  initialQuery: string;
  forYou: ForYouData;
  collections: HomeCollection[];
  // Only honored by the standard layout; premium variants use their own
  // narrative order (see the subscribe-page note).
  sectionOrder?: string[];
};

// Resolve a collection's ordered id list against the catalog the client already
// has. Mirrors how HomeCollections does it, kept here so every variant shares
// one implementation.
export function resolveCollection(shoes: Shoe[], ids: string[]): Shoe[] {
  const byId = new Map(shoes.map((s) => [s.id, s]));
  return ids.map((id) => byId.get(id)).filter((s): s is Shoe => Boolean(s));
}

// Top N shoes site-wide by overall rating — the podium / standings source.
// Uses the already-computed, site-wide-percentile finalStars (same field the
// "top" collection sorts on), so there's no new scoring here.
export function topRated(shoes: Shoe[], n: number): Shoe[] {
  return [...shoes]
    .filter((s) => s.finalStars != null)
    .sort((a, b) => (b.finalStars ?? 0) - (a.finalStars ?? 0))
    .slice(0, n);
}
