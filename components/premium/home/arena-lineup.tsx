"use client";

// ARENA (Champion) "Your starting five" — the member's first five favorites as a
// lineup. Fewer than five (or signed out) tops up from a fallback pool (popular)
// so the rail is never sad-empty. Reused by the Arena home and Arena favorites.
// favorites is empty on the server and fills in after the client fetch, so the
// first paint shows the fallback and then swaps — no hydration mismatch.

import { useMemo } from "react";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { ShoeCard } from "@/components/home/shoe-card";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Shoe } from "@/lib/types";

export function ArenaLineup({ shoes, fallback = [] }: { shoes: Shoe[]; fallback?: Shoe[] }) {
  const { translate } = useLocale();
  const { favorites } = useFavorites();

  const lineup = useMemo(() => {
    const byId = new Map(shoes.map((s) => [s.id, s]));
    const picked: Shoe[] = [];
    const seen = new Set<string>();
    for (const id of favorites) {
      const s = byId.get(id);
      if (s && !seen.has(s.id)) {
        picked.push(s);
        seen.add(s.id);
      }
      if (picked.length >= 5) break;
    }
    for (const s of fallback) {
      if (picked.length >= 5) break;
      if (!seen.has(s.id)) {
        picked.push(s);
        seen.add(s.id);
      }
    }
    return picked;
  }, [shoes, favorites, fallback]);

  if (lineup.length === 0) return null;

  return (
    <ul className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {lineup.map((s, i) => (
        <ShoeCard key={s.id} shoe={s} index={i} rankBadge={i + 1} className="w-[150px] shrink-0" footnote={i === 0 ? translate("Captain") : undefined} />
      ))}
    </ul>
  );
}
