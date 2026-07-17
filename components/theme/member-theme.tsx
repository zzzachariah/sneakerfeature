"use client";

// Applies a paid member's chosen skin (Sapphire / Aurora / Obsidian) to the
// WHOLE site — not just the badge and the subscribe-page preview. The site's
// accent everywhere (primary CTAs, active states, focus rings, highlights) is
// driven by the --brand / --brand-contrast CSS custom properties; here we
// override them with the skin's accent so a member's chosen look carries across
// every page. Free / signed-out visitors keep the default brand orange.
//
// Two pieces work together, mirroring ThemeInitScript / SkinInitScript:
//   • MemberThemeInitScript — a blocking inline <script> that runs BEFORE first
//     paint and re-applies the last-known accent from localStorage, so a
//     returning member never sees a flash of the default orange.
//   • MemberThemeApplier — a client effect that resolves the LIVE accent from
//     auth state, writes the CSS vars, and persists them for the pre-paint script.

import { useEffect } from "react";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { hexToRgbTriple, skinPalette } from "@/lib/subscription/skins";
import { isPaidTier } from "@/lib/subscription/tiers";

const BRAND_KEY = "sf-member-brand";
const CONTRAST_KEY = "sf-member-brand-contrast";

export function MemberThemeApplier() {
  const { tier, skin, loaded } = useAuthState();

  useEffect(() => {
    if (!loaded) return;
    const root = document.documentElement;

    // Free / signed-out (or an expired paid tier that resolved to free): clear
    // any override so the default brand token from globals.css takes over again.
    if (!isPaidTier(tier)) {
      root.style.removeProperty("--brand");
      root.style.removeProperty("--brand-contrast");
      root.removeAttribute("data-member-skin");
      try {
        window.localStorage.removeItem(BRAND_KEY);
        window.localStorage.removeItem(CONTRAST_KEY);
      } catch {
        /* storage blocked — nothing to clean up */
      }
      return;
    }

    const pal = skinPalette(skin, tier);
    const brand = hexToRgbTriple(pal.accent);
    const contrast = hexToRgbTriple(pal.onAccent);
    if (brand) root.style.setProperty("--brand", brand);
    if (contrast) root.style.setProperty("--brand-contrast", contrast);
    root.setAttribute("data-member-skin", skin);
    try {
      if (brand) window.localStorage.setItem(BRAND_KEY, brand);
      if (contrast) window.localStorage.setItem(CONTRAST_KEY, contrast);
    } catch {
      /* storage blocked — the accent still applies for this session */
    }
  }, [tier, skin, loaded]);

  return null;
}

export function MemberThemeInitScript({ nonce }: { nonce?: string }) {
  // Fail-safe: an empty catch means a storage error just leaves the default
  // brand token untouched — the site can never end up unstyled.
  const code = `(() => { try { var b = localStorage.getItem('${BRAND_KEY}'); var c = localStorage.getItem('${CONTRAST_KEY}'); var r = document.documentElement; if (b) r.style.setProperty('--brand', b); if (c) r.style.setProperty('--brand-contrast', c); } catch (e) {} })();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
