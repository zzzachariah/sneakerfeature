"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Heart } from "lucide-react";
import { useAuthState } from "@/components/auth/auth-state-provider";
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
  const { signedIn, loaded: authLoaded } = useAuthState();
  const { translate } = useLocale();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const timerRef = useRef<number | null>(null);

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
          className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
          style={{ bottom: "calc(var(--mobile-nav-h, 0px) + 20px)" }}
          aria-live="polite"
        >
          <div className="glass glass-rim pop-in shadow-lift pointer-events-auto flex max-w-full items-center gap-2.5 rounded-2xl px-4 py-2.5">
            <Heart
              className={`h-4 w-4 shrink-0 ${toast.added ? "fill-[rgb(var(--brand))] text-[rgb(var(--brand))]" : "text-[rgb(var(--subtext))]"}`}
            />
            <span className="text-sm font-medium leading-snug">{translate(toast.message)}</span>
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
