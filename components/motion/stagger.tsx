"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { EASE, DUR } from "@/lib/motion/constants";

// Orchestrated list / grid entrance: a container reveals its children one after
// another as it scrolls into view, and — by default — replays the cascade every
// time it scrolls back in (it resets only once fully off-screen, so long grids
// never fade out mid-view). Pairs with the CSS `.reveal` primitive but is
// nicer for grids and rails where many siblings should cascade. Fully disables
// itself under prefers-reduced-motion (renders plain markup, no transforms).

type Tag = "div" | "ul" | "ol" | "section";

const containerVariants = (gap: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

const itemVariants = (y: number): Variants => ({
  // The reset back to hidden happens off-screen — keep it quick and unstaggered
  // so re-entering mid-scroll never catches items still fading out.
  hidden: { opacity: 0, y, transition: { duration: DUR.base, ease: EASE } },
  show: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
});

export function Stagger({
  children,
  className,
  style,
  as = "div",
  gap = 0.05,
  delay = 0.02,
  amount = "some",
  once = false,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: Tag;
  /** seconds between each child */
  gap?: number;
  /** seconds before the first child */
  delay?: number;
  /**
   * How much of the container must be visible to trigger. The default "some"
   * (any part) is what lets replay-on-scroll work for containers taller than
   * the viewport: they enter as soon as they peek in and reset only once
   * fully gone. A fraction (e.g. 0.15) delays the entrance but also makes a
   * tall container flip back to hidden while its tail is still visible — only
   * use one together with `once`.
   */
  amount?: "some" | "all" | number;
  /** play only on the first scroll-into-view instead of every entry */
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  const MotionTag = motion[as];

  if (reduce) {
    const Tag = as;
    return (
      <Tag className={className} style={style}>
        {children}
      </Tag>
    );
  }

  return (
    <MotionTag
      className={className}
      style={style}
      variants={containerVariants(gap, delay)}
      initial="hidden"
      whileInView="show"
      viewport={{ once, amount }}
    >
      {children}
    </MotionTag>
  );
}

export function StaggerItem({
  children,
  className,
  style,
  as = "div",
  y = 12,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "li";
  /** vertical travel in px */
  y?: number;
}) {
  const reduce = useReducedMotion();
  if (reduce) {
    const Tag = as;
    return (
      <Tag className={className} style={style}>
        {children}
      </Tag>
    );
  }
  const MotionTag = motion[as];
  return (
    <MotionTag className={className} style={style} variants={itemVariants(y)}>
      {children}
    </MotionTag>
  );
}
