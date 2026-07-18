"use client";

// Top-bar membership entry. Non-members (free / signed-out) get a gold
// "Upgrade" pill; Pro / Max members instead see their current plan (themed by
// their chosen skin), both linking to /subscribe. Hidden entirely when the
// membership surface is switched off. Rendered in the navbar's right cluster.

import Link from "next/link";
import { Crown } from "lucide-react";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { useLocale } from "@/components/i18n/locale-provider";
import { isPaidTier, TIERS } from "@/lib/subscription/tiers";
import { skinPalette, memberChipVars } from "@/lib/subscription/skins";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { haptics } from "@/lib/native/haptics";

const GOLD = "#d9b45a";

export function UpgradeNav() {
  const { tier, skin, loaded } = useAuthState();
  const { locale } = useLocale();
  const zh = locale === "zh";

  if (!SUBSCRIBE_LIVE) return null;
  // Wait until we know the tier so members never see a flash of "Upgrade".
  if (!loaded) return null;

  const base =
    "group relative inline-flex h-9 shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full px-2.5 text-xs font-semibold transition-transform duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] md:h-8 md:px-3";

  if (isPaidTier(tier)) {
    const pal = skinPalette(skin, tier);
    const cfg = TIERS[tier];
    return (
      <Link
        href="/subscribe"
        aria-label={zh ? "会员" : "Membership"}
        onClick={() => haptics.tap()}
        className={`${base} member-chip`}
        style={memberChipVars(pal)}
      >
        <span className="relative" aria-hidden>{cfg.badgeGlyph}</span>
        <span className="relative">{cfg.name}</span>
      </Link>
    );
  }

  return (
    <Link
      href="/subscribe"
      aria-label={zh ? "升级会员" : "Upgrade"}
      onClick={() => haptics.tap()}
      className={`${base} upgrade-shine upgrade-gold`}
      style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912f)`, color: "#1a1305" }}
    >
      <Crown className="relative h-3.5 w-3.5 transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5 group-hover:scale-110" aria-hidden />
      <span className="relative">{zh ? "升级会员" : "Upgrade"}</span>
    </Link>
  );
}
