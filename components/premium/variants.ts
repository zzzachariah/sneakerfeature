// The bridge between a Premium UI *skin* (a color/material identity) and a
// *variant* (a structural design language for the page trees). A skin decides
// colors + fonts + materials via CSS; a variant decides how a page is
// COMPOSED — which blocks appear, in what order, wrapped in what shell.
//
// Every page family has a <XSwitch> that reads usePremiumVariant() and renders
// either the untouched standard component (variant === "standard") or the
// matching premium variant. When no skin is active the mapping resolves to
// "standard", so the standard render path is byte-for-byte the current site.

"use client";

import type { SkinId } from "@/lib/subscription/skins";
import { usePremiumSkin } from "@/components/theme/premium-skin-context";

export type PremiumVariant = "standard" | "editorial" | "instrument" | "gallery" | "arena";

// Skin → variant. Kept as a plain record so downgrading any single skin to the
// standard structure (a fast rollback lever) is a one-line change here without
// touching its colors.
const SKIN_TO_VARIANT: Record<SkinId, PremiumVariant> = {
  sapphire: "editorial",
  aurora: "instrument",
  obsidian: "gallery",
  champion: "arena",
};

export function variantForSkin(skin: SkinId | null): PremiumVariant {
  return skin ? SKIN_TO_VARIANT[skin] : "standard";
}

/** The active structural variant, derived from the live Premium UI skin. */
export function usePremiumVariant(): PremiumVariant {
  const { skin } = usePremiumSkin();
  return variantForSkin(skin);
}
