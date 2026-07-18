"use client";

import { TIERS, type Tier } from "@/lib/subscription/tiers";
import { skinPalette, type SkinId } from "@/lib/subscription/skins";

// Small tier badge, themed by the member's chosen skin. Renders nothing for the
// free tier. Used next to the username and anywhere member status is surfaced.
export function MemberBadge({ tier, skin, className }: { tier: Tier; skin: SkinId; className?: string }) {
  if (tier === "free") return null;
  const pal = skinPalette(skin, tier);
  const cfg = TIERS[tier];
  return (
    <span
      className={`member-badge-shine relative inline-flex items-center gap-1 overflow-hidden rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${className ?? ""}`}
      style={{ color: pal.badgeInk, backgroundColor: pal.badgeFill, border: `1px solid ${pal.badgeBorder}` }}
    >
      <span className="relative" aria-hidden>{cfg.badgeGlyph}</span>
      <span className="relative">{cfg.name}</span>
    </span>
  );
}
