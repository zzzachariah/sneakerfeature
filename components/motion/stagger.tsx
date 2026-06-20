"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { EASE, DUR } from "@/lib/motion/constants";

// Orchestrated list / grid entrance: a container reveals its children one after
// another as it scrolls into view. Pairs with the CSS `.reveal` primitive but is
// nicer for grids and rails where many siblings should cascade. Fully disables
// itself under prefers-reduced-motion (renders plain markup, no transforms).

type Tag = "div" | "ul" | "ol" | "section";

const containerVariants = (gap: number, delay: number): Variants => ({
  hidden: {},
  show: { transition: { staggerChildren: gap, delayChildren: delay } },
});

const itemVariants = (y: number): Variants => ({
  hidden: { opacity: 0, y },
  show: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
});

export function Stagger({
  children,
  className,
  style,
  as = "div",
  gap = 0.05,
  delay = 0.02,
  amount = 0.15,
  once = true,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  as?: Tag;
  /** seconds between each child */
  gap?: number;
  /** seconds before the first child */
  delay?: number;
  /** fraction of the container that must be visible to trigger */
  amount?: number;
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
