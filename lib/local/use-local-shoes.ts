"use client";

import { useEffect, useState } from "react";
import type { Shoe } from "@/lib/types";
import { readCatalog, writeCatalog } from "@/lib/local/shoe-store";

// Returns the freshest shoe list to render, backed by an on-device IndexedDB
// copy of the public catalog:
//
//   • Online with server data → renders the SSR `initialShoes` (which keeps any
//     per-user personalization) and silently refreshes the local copy in the
//     background so it's ready offline.
//   • Offline / no server data → falls back to the local catalog so the database
//     is still browsable.
//
// The background fetch uses a conditional GET (the stored version as ETag), so a
// re-sync that finds nothing changed transfers almost nothing. It never overrides
// the personalized server list — the local (public) catalog is only shown when
// there was no server data to begin with.
export function useLocalShoes(initialShoes: Shoe[]): Shoe[] {
  const [shoes, setShoes] = useState<Shoe[]>(initialShoes);

  useEffect(() => {
    let cancelled = false;
    if (initialShoes.length > 0) setShoes(initialShoes);

    void (async () => {
      const local = await readCatalog();
      if (!cancelled && initialShoes.length === 0 && local?.shoes.length) {
        setShoes(local.shoes); // offline / SSR gave nothing → show the local copy
      }
      try {
        const res = await fetch("/api/shoes", {
          headers: {
            "x-sf-app": "1",
            ...(local?.version ? { "If-None-Match": `"${local.version}"` } : {})
          },
          cache: "no-store"
        });
        if (res.status !== 200) return; // 304 (unchanged) or blocked — keep local
        const data = (await res.json()) as { version: string; shoes: Shoe[] };
        if (cancelled) return;
        await writeCatalog({ version: data.version, shoes: data.shoes });
        if (initialShoes.length === 0) setShoes(data.shoes);
      } catch {
        /* offline — keep whatever we already have */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialShoes]);

  return shoes;
}
