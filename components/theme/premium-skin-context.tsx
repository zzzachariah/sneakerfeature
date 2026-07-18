"use client";

// Premium UI skin state, lifted from "a CSS attribute" to "a value React and the
// server both see". The menu-bar toggle used to only stamp data-premium + write
// localStorage — enough to re-color the site from globals.css, but invisible to
// React, so no component could render a different STRUCTURE per skin.
//
// This module adds the missing plumbing:
//   • a cookie (sf-premium-ui) written alongside localStorage, so app/layout.tsx
//     can read the skin on the SERVER and render the correct structural variant
//     with no flash;
//   • PremiumSkinProvider / usePremiumSkin(), seeded from the server value, so
//     every variant <XSwitch> picks its layout from context;
//   • cross-tab + reconciliation logic.
//
// Source-of-truth rule: localStorage is the CLIENT truth. The cookie only exists
// to give the server a first-paint guess. If the two ever disagree, localStorage
// wins and the cookie is rewritten to match (see PremiumSkinInitScript + the
// mount effect below). This keeps the SSR'd variant and the hydrated variant in
// agreement in the common case, with at most one post-hydration correction in
// the rare divergent case.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { isSkinId, type SkinId } from "@/lib/subscription/skins";

export const PREMIUM_UI_KEY = "sf-premium-ui";
// One year, matching the locale cookie's lifetime.
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function writePremiumCookie(skin: SkinId | null) {
  try {
    document.cookie = skin
      ? `${PREMIUM_UI_KEY}=${skin}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`
      : `${PREMIUM_UI_KEY}=; path=/; max-age=0; samesite=lax`;
  } catch {
    /* cookies blocked — the attribute + localStorage paths still work */
  }
}

// Apply a skin choice to every layer at once: the <html> attribute (drives the
// CSS), localStorage (client source of truth), and the cookie (server hint).
export function applyPremiumSkin(skin: SkinId | null) {
  const root = document.documentElement;
  try {
    if (skin) {
      root.setAttribute("data-premium", skin);
      window.localStorage.setItem(PREMIUM_UI_KEY, skin);
    } else {
      root.removeAttribute("data-premium");
      window.localStorage.removeItem(PREMIUM_UI_KEY);
    }
  } catch {
    // storage blocked — the attribute still applies for this session
    if (skin) root.setAttribute("data-premium", skin);
    else root.removeAttribute("data-premium");
  }
  writePremiumCookie(skin);
}

export function readPremiumSkin(): SkinId | null {
  try {
    const v = window.localStorage.getItem(PREMIUM_UI_KEY);
    return isSkinId(v) ? v : null;
  } catch {
    return null;
  }
}

// Pre-paint: apply the stored premium skin before React hydrates so a returning
// user never flashes the default look, AND reconcile the cookie to localStorage
// so the server renders the matching structural variant next load. localStorage
// is authoritative: if it's empty but a stale cookie lingers, we clear both here.
export function PremiumSkinInitScript({ nonce }: { nonce?: string }) {
  const code = `(() => { try { var K='${PREMIUM_UI_KEY}'; var v = localStorage.getItem(K); var ok = v==='sapphire'||v==='aurora'||v==='obsidian'||v==='champion'; var r = document.documentElement; var has = ('; '+document.cookie).indexOf('; '+K+'=') !== -1; if (ok) { r.setAttribute('data-premium', v); if (('; '+document.cookie).indexOf('; '+K+'='+v) === -1) document.cookie = K+'='+v+'; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax'; } else if (has) { r.removeAttribute('data-premium'); document.cookie = K+'=; path=/; max-age=0; samesite=lax'; } } catch (e) {} })();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}

type PremiumSkinContextValue = {
  skin: SkinId | null;
  setSkin: (skin: SkinId | null) => void;
};

// Default degrades to "no skin" so an accidental use outside the provider renders
// the standard site rather than crashing.
const PremiumSkinContext = createContext<PremiumSkinContextValue>({
  skin: null,
  setSkin: () => {},
});

export function PremiumSkinProvider({
  initialSkin,
  children,
}: {
  initialSkin: SkinId | null;
  children: ReactNode;
}) {
  // Seeded from the server (cookie) value so the first client render matches SSR.
  const [skin, setSkinState] = useState<SkinId | null>(initialSkin);

  const setSkin = useCallback((next: SkinId | null) => {
    applyPremiumSkin(next);
    setSkinState(next);
  }, []);

  useEffect(() => {
    // Reconcile against the client source of truth once mounted. In the common
    // case localStorage === the cookie value → no change. On divergence,
    // localStorage wins (setSkin also rewrites the cookie for next load).
    const stored = readPremiumSkin();
    if (stored !== skin) setSkin(stored);

    // Keep tabs in sync: another tab flipping the skin updates this one.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PREMIUM_UI_KEY) return;
      const v = readPremiumSkin();
      applyPremiumSkin(v);
      setSkinState(v);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
    // Intentionally run once on mount; setSkin is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <PremiumSkinContext.Provider value={{ skin, setSkin }}>{children}</PremiumSkinContext.Provider>;
}

export function usePremiumSkin(): PremiumSkinContextValue {
  return useContext(PremiumSkinContext);
}
