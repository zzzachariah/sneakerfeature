"use client";

// The luxury membership card. Beyond a flat gradient it carries the cues of a
// real metal / holographic card:
//   • a restrained pointer 3D tilt (±5°, inert on touch / reduced-motion),
//   • a holographic foil whose specular highlight tracks the cursor (via the
//     --foil-x/--foil-y vars useTilt writes),
//   • an engraved guilloché texture + embossed emblem + lit EMV chip,
//   • optional personalization (the member's name, join year, serial), and
//   • an optional tap-to-flip to a functional back: signature strip + holo
//     seal, the tier's privileges, member no. / valid-thru / since, and the
//     skin edition — on a deliberately darker ground so the flip visibly
//     lands somewhere new instead of echoing the front.
//
// `interactive={false}` yields a still, front-only card for previews and for
// offscreen capture when sharing. Personalization props are optional: without
// them the card renders the generic "Member" face used for product previews.

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { TIERS } from "@/lib/subscription/tiers";
import { SKINS, skinPalette, type SkinId } from "@/lib/subscription/skins";
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

  // The back face lists what the tier actually grants, straight from the tier
  // config so copy can never drift from entitlements. Differentiators first;
  // capped at 4 so the grid never outgrows the card.
  // Labels stay short enough to never wrap in a half-card column at 288px.
  const caps = cfg.capabilities;
  const privileges = [
    caps.premiumModel ? `${caps.monthlyAllowance} AI credits / mo` : null,
    caps.preciseSizing ? "Precise sizing" : null,
    caps.priority ? "Priority lane" : null,
    caps.earlyAccess ? "Early access" : null,
    caps.baseUnlimited ? "Unlimited base AI" : null
  ]
    .filter((x): x is string => Boolean(x))
    .slice(0, 4);

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
      className={`relative ${flippable ? "cursor-pointer" : ""} ${className ?? ""}`}
      onPointerMove={interactive ? tilt.onPointerMove : undefined}
      onPointerLeave={interactive ? tilt.onPointerLeave : undefined}
      // The whole card flips on tap (the corner button is the visible
      // affordance and stops propagation, so it never double-toggles).
      onClick={flippable ? () => setFlipped((f) => !f) : undefined}
      style={{ perspective: "1000px" }}
    >
      <div
        className="mcard-3d relative aspect-[1.586/1] w-full"
        data-flipped={flipped}
        style={{
          transformStyle: "preserve-3d",
          WebkitTransformStyle: "preserve-3d",
          transition: reduce ? undefined : "transform 620ms cubic-bezier(0.22,1,0.36,1)",
          transform: `rotateX(var(--tilt-x, 0deg)) rotateY(calc(var(--tilt-y, 0deg) + ${flipped ? "180deg" : "0deg"}))`
        }}
      >
        {/* ── Front ── */}
        <div
          className="absolute inset-0 overflow-hidden rounded-2xl p-5"
          style={{
            background: p.cardBg,
            color: p.cardInk,
            boxShadow: faceShadow,
            backfaceVisibility: "hidden",
            WebkitBackfaceVisibility: "hidden"
          }}
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
            WebkitBackfaceVisibility: "hidden",
            transform: "rotateY(180deg)"
          }}
        >
          {guilloche}
          {/* Deeper ground than the front so the flip visibly lands on a new face. */}
          <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: "rgba(0,0,0,0.32)" }} />
          {/* Magnetic stripe */}
          <div
            className="absolute left-0 right-0 top-3 h-7"
            style={{
              background: "linear-gradient(180deg, rgba(0,0,0,0.78), rgba(0,0,0,0.62))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(0,0,0,0.4)"
            }}
          />

          <div className="relative flex h-full flex-col p-4 pt-[2.9rem]">
            {/* Signature strip + holographic seal */}
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-7 min-w-0 flex-1 items-center justify-between rounded-[4px] px-2.5"
                style={{
                  background: "repeating-linear-gradient(0deg, #f3f0e7 0 2px, #e6e2d3 2px 4px)",
                  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.18)",
                  color: "#23272f"
                }}
              >
                <span className="truncate font-serif text-[0.8rem] italic">{holder || "Member"}</span>
                <span className="ml-2 shrink-0 text-[0.45rem] font-bold uppercase tracking-[0.18em]" style={{ color: "#8f8a77" }}>
                  Authorized signature
                </span>
              </div>
              <div
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm leading-none"
                style={{
                  background: `conic-gradient(from 200deg, ${p.accentSoft}59, ${p.accent}1f, ${p.accentSoft}80, ${p.accent}2e, ${p.accentSoft}59)`,
                  border: `1px solid ${p.accentSoft}70`,
                  boxShadow: `inset 0 0 8px ${p.accent}45`,
                  color: p.accentSoft,
                  textShadow: "0 1px 1px rgba(0,0,0,0.4)"
                }}
              >
                {p.emblem}
              </div>
            </div>

            {/* Tier privileges — the reason this card exists. */}
            <div className="mt-2">
              <div className="text-[0.48rem] font-bold uppercase tracking-[0.22em]" style={{ color: p.accentSoft }}>
                {cfg.name} privileges
              </div>
              <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
                {privileges.map((item) => (
                  <li
                    key={item}
                    className="flex items-baseline gap-1.5 whitespace-nowrap text-[0.55rem] leading-[1.3]"
                    style={{ opacity: 0.9 }}
                  >
                    <span aria-hidden className="shrink-0 text-[0.48rem]" style={{ color: p.accentSoft }}>
                      ✦
                    </span>
                    <span className="min-w-0 truncate">{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Identity row + edition footer, pinned to the bottom edge. */}
            <div className="mt-auto">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-[0.45rem] uppercase tracking-[0.18em]" style={{ opacity: 0.6 }}>
                    Member No.
                  </div>
                  <div className="num-display text-[0.7rem] tracking-[0.14em]">{serial ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[0.45rem] uppercase tracking-[0.18em]" style={{ opacity: 0.6 }}>
                    Valid thru
                  </div>
                  <div className="num-display text-[0.7rem] tracking-[0.14em]">{validLabel ?? "ACTIVE"}</div>
                </div>
                <div className="text-right">
                  <div className="text-[0.45rem] uppercase tracking-[0.18em]" style={{ opacity: 0.6 }}>
                    Since
                  </div>
                  <div className="num-display text-[0.7rem] tracking-[0.14em]">{sinceYear ?? "—"}</div>
                </div>
              </div>
              {/* pr clears the corner flip button so the edition line never runs under it. */}
              <div className="mt-1 flex items-center justify-between gap-2 border-t pb-0.5 pr-8 pt-1" style={{ borderColor: `${p.accentSoft}33` }}>
                <span className="shrink-0 text-[0.5rem] font-bold uppercase tracking-[0.2em]" style={{ opacity: 0.78 }}>
                  sneakerfeature
                </span>
                <span className="truncate text-[0.45rem] uppercase tracking-[0.14em]" style={{ opacity: 0.6 }}>
                  {SKINS[skin].nameEn} edition
                </span>
              </div>
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
