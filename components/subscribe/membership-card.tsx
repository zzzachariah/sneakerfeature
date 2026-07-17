"use client";

// The luxury membership card — themed by the chosen skin + tier palette. Beyond
// the flat gradient it now carries the cues of a real metal / holographic card:
// a pointer-driven 3D tilt (restrained, ±5°), a slow engraved guilloché texture,
// an embossed emblem, and a drifting light sheen. All motion is opt-out: the
// tilt is inert on touch / reduced-motion (see useTilt + globals.css), and the
// sheen honors useReducedMotion. `interactive={false}` yields a still card for
// previews (e.g. the homepage promo).

import { motion, useReducedMotion } from "framer-motion";
import { TIERS } from "@/lib/subscription/tiers";
import { skinPalette, type SkinId } from "@/lib/subscription/skins";
import { useTilt } from "@/lib/hooks/use-tilt";

export function MembershipCard({
  tier,
  skin,
  active = false,
  interactive = true,
  className
}: {
  tier: "pro" | "max";
  skin: SkinId;
  active?: boolean;
  interactive?: boolean;
  className?: string;
}) {
  const p = skinPalette(skin, tier);
  const cfg = TIERS[tier];
  const reduce = useReducedMotion();
  const tilt = useTilt(5);

  return (
    <div
      className={interactive ? "tilt-3d" : undefined}
      onPointerMove={interactive ? tilt.onPointerMove : undefined}
      onPointerLeave={interactive ? tilt.onPointerLeave : undefined}
    >
      <div
        className={`relative aspect-[1.586/1] w-full overflow-hidden rounded-2xl p-5 ${className ?? ""}`}
        style={{
          background: p.cardBg,
          color: p.cardInk,
          boxShadow: active
            ? `0 30px 60px -24px rgba(0,0,0,0.6), 0 0 0 1px ${p.accent}55, inset 0 1px 0 rgba(255,255,255,0.12)`
            : "0 20px 44px -26px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)"
        }}
      >
        {/* Engraved guilloché — faint diagonal + cross weave, like security
            printing on a real card. Kept very low-alpha so it reads as texture,
            not pattern. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: `repeating-linear-gradient(115deg, ${p.accentSoft}14 0 1px, transparent 1px 6px), repeating-linear-gradient(65deg, ${p.accentSoft}0f 0 1px, transparent 1px 7px)`,
            mixBlendMode: "soft-light",
            opacity: 0.6
          }}
        />

        {/* Sheen */}
        {!reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(125deg, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 62%, rgba(255,255,255,0.1) 100%)",
              mixBlendMode: "screen"
            }}
            animate={{ x: ["-4%", "4%", "-4%"] }}
            transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="text-[0.7rem] font-bold uppercase tracking-[0.22em]" style={{ color: p.accentSoft }}>
              {cfg.name}
            </span>
            <span className="text-[0.7rem] tracking-wide" style={{ opacity: 0.7 }}>
              sneakerfeature
            </span>
          </div>
          {/* EMV-style chip */}
          <div
            className="h-7 w-10 rounded-md"
            style={{
              background: `linear-gradient(135deg, ${p.accentSoft}, ${p.accent})`,
              opacity: 0.9,
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.25)"
            }}
          />
          <div className="text-lg font-semibold tracking-tight">Member</div>
          <div className="flex items-end justify-between">
            <span
              className="text-2xl leading-none"
              style={{
                color: p.accentSoft,
                // Emboss the emblem: a lit top edge + shaded bottom edge.
                textShadow: "0 1px 0 rgba(255,255,255,0.25), 0 -1px 1px rgba(0,0,0,0.35)"
              }}
              aria-hidden
            >
              {p.emblem}
            </span>
            <span className="text-[0.65rem] uppercase tracking-[0.14em]" style={{ opacity: 0.7 }}>
              {tier === "max" ? "Signature" : "Member"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
