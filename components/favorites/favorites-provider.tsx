"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Heart } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

type FavoritesValue = {
  favorites: Set<string>;
  loaded: boolean;
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => Promise<void>;
};

type Toast = { key: number; message: string; added: boolean; href?: string } | null;

const FavoritesContext = createContext<FavoritesValue | null>(null);
const TOAST_MS = 3500;

// Loads the signed-in user's saved shoes once, toggles optimistically (reverting
// on failure), and surfaces a small toast on each change with a "View" shortcut
// to /favorites. Degrades silently when the DB/table is absent.
export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { translate } = useLocale();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
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
  }, []); // run once on mount; auth cookie is included automatically

  const showToast = useCallback((message: string, added: boolean, href?: string) => {
    setToast({ key: Date.now(), message, added, href });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

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
      showToast(
        adding ? "Saved to your shoes" : "Removed from saved",
        adding,
        adding ? "/favorites" : undefined
      );
      try {
        const res = await fetch("/api/favorites", {
          method: adding ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ shoeId: id })
        });
        if (!res.ok) throw new Error("request failed");
      } catch {
        setFavorites((prev) => {
          const next = new Set(prev);
          if (adding) next.delete(id);
          else next.add(id);
          return next;
        });
        showToast("Couldn't update saved shoes", false);
      }
    },
    [favorites, showToast]
  );

  return (
    <FavoritesContext.Provider value={{ favorites, loaded, isFavorite, toggle }}>
      {children}

      {toast && (
        <div
          key={toast.key}
          className="pointer-events-none fixed left-1/2 z-50 flex -translate-x-1/2 justify-center px-4"
          style={{ bottom: "calc(var(--mobile-nav-h, 0px) + 20px)" }}
          aria-live="polite"
        >
          <div className="glass glass-rim glass-clip relative pop-in shadow-lift pointer-events-auto flex max-w-[92vw] items-center gap-3 rounded-full px-4 py-2.5">
            <Heart
              className={`h-4 w-4 ${toast.added ? "fill-[rgb(var(--brand))] text-[rgb(var(--brand))]" : "text-[rgb(var(--subtext))]"}`}
            />
            <span className="truncate text-sm font-medium">{translate(toast.message)}</span>
            {toast.href && (
              <Link
                href={toast.href as Route}
                onClick={() => setToast(null)}
                className="shrink-0 text-sm font-semibold text-[rgb(var(--brand))] transition hover:opacity-80"
              >
                {translate("View")}
              </Link>
            )}
          </div>
        </div>
      )}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites must be used within FavoritesProvider");
  return ctx;
}
