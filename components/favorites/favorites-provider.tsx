"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuthState } from "@/components/auth/auth-state-provider";

type FavoritesValue = {
  favorites: Set<string>;
  loaded: boolean;
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => Promise<void>;
};

const FavoritesContext = createContext<FavoritesValue | null>(null);

// Loads the signed-in user's saved shoes once, then toggles optimistically and
// reverts on failure. Degrades silently when the DB/table is absent (demo mode,
// migration not yet applied) — the heart just won't persist.
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { signedIn, loaded: authLoaded } = useAuthState();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authLoaded) return;
    if (!signedIn) {
      setFavorites(new Set());
      setLoaded(true);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const res = await fetch("/api/favorites");
        const data = await res.json();
        if (active && data?.ok) setFavorites(new Set<string>(data.shoeIds ?? []));
      } catch {
        /* ignore */
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [authLoaded, signedIn]);

  const isFavorite = useCallback((id: string) => favorites.has(id), [favorites]);

  const toggle = useCallback(
    async (id: string) => {
      const adding = !favorites.has(id);
      setFavorites((prev) => {
        const next = new Set(prev);
        if (adding) next.add(id);
        else next.delete(id);
        return next;
      });
      try {
        const res = await fetch("/api/favorites", {
          method: adding ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shoeId: id })
        });
        if (!res.ok) throw new Error("request failed");
      } catch {
        // Revert on failure.
        setFavorites((prev) => {
          const next = new Set(prev);
          if (adding) next.delete(id);
          else next.add(id);
          return next;
        });
      }
    },
    [favorites]
  );

  return (
    <FavoritesContext.Provider value={{ favorites, loaded, isFavorite, toggle }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
