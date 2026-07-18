"use client";

// The luxury membership card. Beyond a flat gradient it carries the cues of a
// real metal / holographic card:
//   • a restrained pointer 3D tilt (±5°, inert on touch / reduced-motion),
//   • a holographic foil whose specular highlight tracks the cursor (via the
//     --foil-x/--foil-y vars useTilt writes),
//   • an engraved guilloché texture + embossed emblem + lit EMV chip,
//   • optional personalization (the member's name, join year, serial), and
//   • an optional tap-to-flip to a functional back (valid-thru + member no.).
//
// `interactive={false}` yields a still, front-only card for previews and for
// offscreen capture when sharing. Personalization props are optional: without
// them the card renders the generic "Member" face used for product previews.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { TIERS } from "@/lib/subscription/tiers";
import { skinPalette, type SkinId } from "@/lib/subscription/skins";
import { useTilt } from "@/lib/hooks/use-tilt";

export type MembershipCardProps = {
  tier: "pro" | "max";
  skin: SkinId;
  active?: boolean;
  interactive?: boolean;
  className?: string;
  /** Member's display name — embossed onto the card in place of "Member". */
  holder?: string | null;
  /** ISO date the membership started → "MEMBER SINCE {year}". */
  memberSince?: string | null;
  /** Pre-formatted member serial, e.g. "0042 1337". */
  serial?: string | null;
  /** ISO expiry date for the back face; ignored when `permanent`. */
  validThrough?: string | null;
  permanent?: boolean;
  /** Show the flip affordance + render a functional back face. */
  flippable?: boolean;
};

export function MembershipCard({
  tier,
  skin,
  active = false,
  interactive = true,
  className,
  holder,
  memberSince,
  serial,
  validThrough,
  permanent = false,
  flippable = false
}: MembershipCardProps) {
  const p = skinPalette(skin, tier);
  const cfg = TIERS[tier];
  const reduce = useReducedMotion();
  const tilt = useTilt(5);
  const [flipped, setFlipped] = useState(false);

  const sinceYear = memberSince ? new Date(memberSince).getFullYear() : null;
  const validLabel = permanent
    ? "PERMANENT"
    : validThrough
      ? new Date(validThrough).toLocaleDateString(undefined, { year: "2-digit", month: "2-digit" })
      : null;

  const faceShadow = active
    ? `0 30px 60px -24px rgba(0,0,0,0.6), 0 0 0 1px ${p.accent}55, inset 0 1px 0 rgba(255,255,255,0.12)`
    : "0 20px 44px -26px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.1)";

  const guilloche = (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `repeating-linear-gradient(115deg, ${p.accentSoft}14 0 1px, transparent 1px 6px), repeating-linear-gradient(65deg, ${p.accentSoft}0f 0 1px, transparent 1px 7px)`,
        mixBlendMode: "soft-light",
        opacity: 0.6
      }}
    />
  );

  return (
    <div
      className={`relative ${className ?? ""}`}
      onPointerMove={interactive ? tilt.onPointerMove : undefined}
      onPointerLeave={interactive ? tilt.onPointerLeave : undefined}
      style={{ perspective: "1000px" }}
    >
      <div
        className="mcard-3d relative aspect-[1.586/1] w-full"
        data-flipped={flipped}
        style={{
          transformStyle: "preserve-3d",
          transition: reduce ? undefined : "transform 620ms cubic-bezier(0.22,1,0.36,1)",
          transform: `rotateX(var(--tilt-x, 0deg)) rotateY(calc(var(--tilt-y, 0deg) + ${flipped ? "180deg" : "0deg"}))`
        }}
      >
        {/* ── Front ── */}
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl p-5"
          style={{ background: p.cardBg, color: p.cardInk, boxShadow: faceShadow, backfaceVisibility: "hidden" }}
        >
          {guilloche}

          {/* Holographic foil — specular highlight tracks the cursor. */}
          {interactive && !reduce && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background: `radial-gradient(60% 55% at var(--foil-x, 50%) var(--foil-y, 50%), rgba(255,255,255,0.34), rgba(255,255,255,0.05) 45%, transparent 70%), conic-gradient(from 210deg at var(--foil-x, 50%) var(--foil-y, 50%), ${p.accentSoft}00, ${p.accentSoft}3a, ${p.accent}00, ${p.accentSoft}30, ${p.accentSoft}00)`,
                mixBlendMode: "soft-light",
                opacity: skin === "aurora" ? 0.9 : 0.62,
                transition: "opacity 200ms ease"
              }}
            />
          )}

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
            <div
              className="h-7 w-10 rounded-md"
              style={{
                background: `linear-gradient(135deg, ${p.accentSoft}, ${p.accent})`,
                opacity: 0.9,
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 2px rgba(0,0,0,0.25)"
              }}
            />
            {serial ? (
              <div className="num-display text-[0.95rem] tracking-[0.18em]" style={{ opacity: 0.92 }}>
                {serial}
              </div>
            ) : null}
            <div className="flex items-end justify-between">
              <div className="min-w-0">
                <div className="truncate text-lg font-semibold tracking-tight">{holder || "Member"}</div>
                {sinceYear ? (
                  <div className="text-[0.6rem] uppercase tracking-[0.16em]" style={{ opacity: 0.65 }}>
                    Member since {sinceYear}
                  </div>
                ) : null}
              </div>
              <span
                className="ml-2 shrink-0 text-2xl leading-none"
                style={{ color: p.accentSoft, textShadow: "0 1px 0 rgba(255,255,255,0.25), 0 -1px 1px rgba(0,0,0,0.35)" }}
                aria-hidden
              >
                {p.emblem}
              </span>
            </div>
          </div>
        </div>

        {/* ── Back ── */}
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl"
          style={{
            background: p.cardBg,
            color: p.cardInk,
            boxShadow: faceShadow,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)"
          }}
        >
          {guilloche}
          {/* Magnetic stripe */}
          <div className="absolute left-0 right-0 top-5 h-9" style={{ background: "rgba(0,0,0,0.55)" }} />
          <div className="relative flex h-full flex-col justify-end gap-3 p-5 pt-16">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[0.55rem] uppercase tracking-[0.18em]" style={{ opacity: 0.6 }}>
                  Valid thru
                </div>
                <div className="num-display text-sm tracking-widest">{validLabel ?? "—"}</div>
              </div>
              <div className="text-right">
                <div className="text-[0.55rem] uppercase tracking-[0.18em]" style={{ opacity: 0.6 }}>
                  Member No.
                </div>
                <div className="num-display text-sm tracking-widest">{serial ?? "—"}</div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-3" style={{ borderColor: `${p.accentSoft}33` }}>
              <span className="truncate text-xs font-semibold tracking-tight">{holder || "Member"}</span>
              <span className="text-[0.6rem] font-bold uppercase tracking-[0.2em]" style={{ color: p.accentSoft }}>
                {cfg.name}
              </span>
            </div>
          </div>
        </div>
      </div>

      {flippable && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setFlipped((f) => !f);
          }}
          aria-label={flipped ? "翻回正面" : "翻到背面"}
          aria-pressed={flipped}
          className="absolute bottom-2 right-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-full backdrop-blur transition active:scale-90"
          style={{ backgroundColor: `${p.accent}2e`, border: `1px solid ${p.accentSoft}55`, color: p.cardInk }}
        >
          <RotateCw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
