"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Shoe } from "@/lib/types";
import { readCatalog, writeCatalog } from "@/lib/local/shoe-store";
import { isDemoCatalog } from "@/lib/data/demo-shoes";

// Don't re-pull more than this often when the app keeps gaining focus.
const REFRESH_THROTTLE_MS = 20_000;

// The SSR list counts as real server data only when it's non-empty AND not the
// 3-shoe demo fallback. Treating the demo fallback as "server data" (it passes a
// naive length > 0 check) is what used to strand the home on 3 shoes: it
// suppressed both the on-device fallback and the live /api/shoes refresh, so a
// single transient Supabase blip at SSR time never self-healed in that view.
function hasRealServerData(shoes: Shoe[]): boolean {
  return shoes.length > 0 && !isDemoCatalog(shoes);
}

// Returns the freshest shoe list to render, backed by an on-device IndexedDB
// copy of the public catalog:
//
//   • Online with server data → renders the SSR `initialShoes` (which keeps any
//     per-user personalization) and silently refreshes the local copy.
//   • Offline / no server data → falls back to the local catalog so the database
//     is still browsable.
//
// To make sure it's never stuck on stale data, it re-syncs (and asks the server
// components to re-render via router.refresh) whenever the app returns to the
// foreground — throttled — so an app left open updates when you come back, on top
// of the 60s server revalidate. The background fetch uses a conditional GET (the
// stored version as ETag), so an unchanged re-sync transfers almost nothing.
export function useLocalShoes(initialShoes: Shoe[]): Shoe[] {
  const router = useRouter();
  const [shoes, setShoes] = useState<Shoe[]>(initialShoes);
  const hadServerData = hasRealServerData(initialShoes);

  // Keep the rendered list in step with the (personalized) SSR list — but never
  // let a degraded SSR (demo fallback) clobber a fuller catalog we've already
  // swapped in from the local copy / a live refresh.
  useEffect(() => {
    if (hasRealServerData(initialShoes)) setShoes(initialShoes);
  }, [initialShoes]);

  useEffect(() => {
    let cancelled = false;
    let running = false;
    let lastAt = 0;

    async function sync() {
      if (running) return;
      running = true;
      try {
        const local = await readCatalog();
        if (!cancelled && !hadServerData && local?.shoes.length) setShoes(local.shoes);
        const res = await fetch("/api/shoes", {
          headers: {
            "x-sf-app": "1",
            ...(local?.version ? { "If-None-Match": `"${local.version}"` } : {})
          },
          cache: "no-store"
        });
        if (res.status === 200) {
          const data = (await res.json()) as { version: string; shoes: Shoe[] };
          if (!cancelled) {
            await writeCatalog({ version: data.version, shoes: data.shoes });
            if (!hadServerData) setShoes(data.shoes);
          }
        }
      } catch {
        /* offline — keep whatever we already have */
      } finally {
        running = false;
        lastAt = Date.now();
      }
    }

    void sync();

    // Re-check when the app comes back to the foreground (throttled). The
    // router.refresh re-pulls the SSR list, so the *visible* (personalized) home
    // updates too — not just the offline copy.
    const onForeground = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastAt < REFRESH_THROTTLE_MS) return;
      void sync();
      router.refresh();
    };
    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hadServerData]);

  return shoes;
}
