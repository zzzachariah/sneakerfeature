"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { useRef, type CSSProperties, type ReactNode } from "react";

// Subtle scroll parallax: the content drifts vertically as it passes through the
// viewport. Intended to live inside an `overflow-hidden` box so only the content
// moves (never the box), which keeps it layout-safe — neighbours never shift.
// No-ops under reduced motion.
export function Parallax({
  children,
  className,
  style,
  distance = 20,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** total vertical travel in px across the scroll range */
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);

  if (reduce) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div ref={ref} style={{ ...style, y }} className={className}>
      {children}
    </motion.div>
  );
}
