// Shared motion tokens — the single JS source of truth for framer-motion, mirroring
// the CSS custom properties in globals.css (--ease, --dur-*). Keeping these in one
// place means every animated surface reads the same premium easing / timing, so the
// whole app feels like one motion system rather than a pile of ad-hoc tweens.

/** Premium ease — matches `--ease: cubic-bezier(0.22, 1, 0.36, 1)`. */
export const EASE = [0.22, 1, 0.36, 1] as const;
export const EASE_CSS = "cubic-bezier(0.22, 1, 0.36, 1)";

/** Durations in seconds (framer wants seconds; CSS tokens are ms). */
export const DUR = {
  fast: 0.12,
  base: 0.2,
  slow: 0.32,
  cin: 0.5,
} as const;

/** Snappy spring for press / pop / layout indicators — settles fast, no wobble. */
export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;
/** Softer spring for sheets / larger surfaces — a touch of overshoot. */
export const SPRING_SOFT = { type: "spring", stiffness: 280, damping: 30 } as const;
/** Bouncy spring for celebratory pops (favorite burst, success morphs). */
export const SPRING_POP = { type: "spring", stiffness: 600, damping: 18, mass: 0.7 } as const;

/** Standard fade+rise entrance used by list items / revealed sections. */
export const riseIn = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
} as const;
