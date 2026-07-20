"use client";

// Applies a paid member's chosen skin (Sapphire / Aurora / Obsidian) to the
// WHOLE site — not just the badge and the subscribe-page preview. The site's
// accent everywhere (primary CTAs, active states, focus rings, highlights) is
// driven by the --brand / --brand-contrast CSS custom properties; here we
// override them with the skin's accent so a member's chosen look carries across
// every page. Free / signed-out visitors keep the default brand orange.
//
// The accent is THEME-AWARE: skins carry a darker `accentLight` variant so an
// accent-colored heading / icon / focus ring keeps AA contrast on a light
// background (a light-gold Max heading would otherwise be unreadable). We store
// both triples and pick by the live theme, re-picking when the user toggles.
//
// Two pieces work together, mirroring ThemeInitScript / SkinInitScript:
//   • MemberThemeInitScript — a blocking inline <script> that runs BEFORE first
//     paint and applies the last-known accent (for the current theme) from
//     localStorage, so a returning member never flashes the default orange.
//   • MemberThemeApplier — a client effect that resolves the LIVE accent from
//     auth state, writes the CSS vars, persists them, and reacts to theme flips.

import { useEffect } from "react";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { darkenHex, hexToRgbTriple, skinPalette } from "@/lib/subscription/skins";
import { isPaidTier, MEMBER_TIER_COOKIE, type Tier } from "@/lib/subscription/tiers";

const BRAND_DARK_KEY = "sf-member-brand-dark";
const BRAND_LIGHT_KEY = "sf-member-brand-light";
const CONTRAST_KEY = "sf-member-brand-contrast";

// One year, matching the skin / locale cookies.
const TIER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

// Mirror the resolved paid tier into a cookie so the SERVER can stamp
// data-member-tier on first paint (see app/layout.tsx) — this drives both the
// Max-tier accent in the premium CSS and the per-tier structural variant. Free
// / signed-out clears it. Paired with the data-member-tier attribute set below.
function writeMemberTierCookie(tier: Tier | null) {
  try {
    document.cookie =
      tier === "pro" || tier === "max"
        ? `${MEMBER_TIER_COOKIE}=${tier}; path=/; max-age=${TIER_COOKIE_MAX_AGE}; samesite=lax`
        : `${MEMBER_TIER_COOKIE}=; path=/; max-age=0; samesite=lax`;
  } catch {
    /* cookies blocked — the attribute path still themes this session */
  }
}

export function MemberThemeApplier() {
  const { tier, skin, customAccent, loaded } = useAuthState();

  useEffect(() => {
    if (!loaded) return;
    const root = document.documentElement;

    // Free / signed-out (or an expired paid tier that resolved to free): clear
    // any override so the default brand token from globals.css takes over again.
    if (!isPaidTier(tier)) {
      root.style.removeProperty("--brand");
      root.style.removeProperty("--brand-contrast");
      root.removeAttribute("data-member-skin");
      root.removeAttribute("data-member-tier");
      writeMemberTierCookie(null);
      try {
        window.localStorage.removeItem(BRAND_DARK_KEY);
        window.localStorage.removeItem(BRAND_LIGHT_KEY);
        window.localStorage.removeItem(CONTRAST_KEY);
      } catch {
        /* storage blocked — nothing to clean up */
      }
      return;
    }

    const pal = skinPalette(skin, tier);
    // A Max member's custom "Signature" accent overrides the skin accent
    // site-wide; the light variant is derived by darkening so it stays legible.
    const custom = tier === "max" && customAccent ? customAccent : null;
    const dark = hexToRgbTriple(custom ?? pal.accent);
    const light = hexToRgbTriple(custom ? darkenHex(custom) : pal.accentLight ?? pal.accent);
    const contrast = hexToRgbTriple(pal.onAccent);

    const isDark = () => {
      if (root.classList.contains("dark")) return true;
      if (root.classList.contains("light")) return false;
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };
    const apply = () => {
      // A menu-bar "Premium UI" skin (data-premium) themes the whole site from
      // its own stylesheet — and now tier-aware: html[data-member-tier="max"]
      // carries the skin's Max accent, so deferring already gives a Max member
      // their real (gold / purple / indigo) accent, not the Pro one. We only
      // step in for a Max "Signature" accent, which must still win site-wide over
      // the skin — set it inline (out-specifies the attribute selector). The
      // observer below re-runs this when the skin toggles on/off.
      if (root.hasAttribute("data-premium")) {
        if (custom) {
          const triple = isDark() ? dark : light;
          if (triple) root.style.setProperty("--brand", triple);
          if (contrast) root.style.setProperty("--brand-contrast", contrast);
        } else {
          root.style.removeProperty("--brand");
          root.style.removeProperty("--brand-contrast");
        }
        return;
      }
      const triple = isDark() ? dark : light;
      if (triple) root.style.setProperty("--brand", triple);
      if (contrast) root.style.setProperty("--brand-contrast", contrast);
    };

    apply();
    root.setAttribute("data-member-skin", skin);
    // Expose the paid tier to the server (cookie) and the CSS (attribute) so the
    // Max half of the skin themes the whole site, and the per-tier structural
    // variant renders on first paint.
    root.setAttribute("data-member-tier", tier);
    writeMemberTierCookie(tier);
    try {
      if (dark) window.localStorage.setItem(BRAND_DARK_KEY, dark);
      if (light) window.localStorage.setItem(BRAND_LIGHT_KEY, light);
      if (contrast) window.localStorage.setItem(CONTRAST_KEY, contrast);
    } catch {
      /* storage blocked — the accent still applies for this session */
    }

    // Re-pick the accent when the theme changes: the toggle stamps/removes the
    // .dark/.light class, and the system preference can change under "auto".
    const mo = new MutationObserver(apply);
    mo.observe(root, { attributes: true, attributeFilter: ["class", "data-premium"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener?.("change", apply);
    return () => {
      mo.disconnect();
      mq.removeEventListener?.("change", apply);
    };
  }, [tier, skin, customAccent, loaded]);

  return null;
}

export function MemberThemeInitScript({ nonce }: { nonce?: string }) {
  // Fail-safe: an empty catch means a storage error just leaves the default
  // brand token untouched — the site can never end up unstyled.
  const code = `(() => { try { var r = document.documentElement; if (r.hasAttribute('data-premium')) return; var d = localStorage.getItem('${BRAND_DARK_KEY}'); var l = localStorage.getItem('${BRAND_LIGHT_KEY}'); var c = localStorage.getItem('${CONTRAST_KEY}'); if (!d && !l) return; var dark = r.classList.contains('dark') || (!r.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches); var b = dark ? d : l; if (b) { r.style.setProperty('--brand', b); r.setAttribute('data-member-skin', '1'); } if (c) r.style.setProperty('--brand-contrast', c); } catch (e) {} })();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}
