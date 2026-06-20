"use client";

import { animate, motion, useMotionValue, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { haptics } from "@/lib/native/haptics";
import { SPRING } from "@/lib/motion/constants";

export type SwipeAction = {
  label: string;
  icon?: ReactNode;
  onAction: () => void;
  /** "danger" tints the action red (delete/report); default is neutral. */
  tone?: "neutral" | "danger";
};

// iOS-style swipe-to-reveal row. The content layer drags left over a fixed track
// of action buttons; past half-open (or a fast flick) it snaps open and ticks a
// haptic, otherwise it springs shut. Tapping an action runs it and closes. Degrades
// to a plain row (actions still reachable via their own buttons elsewhere) under
// reduced-motion or when there are no actions.
export function SwipeRow({
  children,
  actions,
  actionWidth = 76,
  className,
  rowClassName,
}: {
  children: ReactNode;
  actions: SwipeAction[];
  /** px width of each action button */
  actionWidth?: number;
  className?: string;
  rowClassName?: string;
}) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const openRef = useRef(false);
  // Only enable on touch (coarse) pointers so a desktop mouse never drags rows.
  // Starts false → renders a plain row on the server + first client paint (no
  // hydration mismatch), then upgrades on touch devices after mount.
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    setTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  if (reduce || !touch || actions.length === 0) {
    return <div className={className}>{children}</div>;
  }

  const total = actions.length * actionWidth;
  const settle = (to: number) => {
    animate(x, to, SPRING);
    openRef.current = to !== 0;
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Action track sits behind the content, revealed as it slides left. */}
      <div className="absolute inset-y-0 right-0 flex">
        {actions.map((a, i) => (
          <button
            key={i}
            type="button"
            onClick={() => {
              haptics.tap();
              a.onAction();
              settle(0);
            }}
            style={{ width: actionWidth }}
            className={cn(
              "flex h-full flex-col items-center justify-center gap-1 text-xs font-semibold",
              a.tone === "danger"
                ? "bg-[rgb(var(--error)/0.92)] text-white"
                : "bg-[rgb(var(--text)/0.1)] text-[rgb(var(--text))]"
            )}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
      </div>

      <motion.div
        className={cn("relative bg-[rgb(var(--bg))]", rowClassName)}
        style={{ x }}
        drag="x"
        dragConstraints={{ left: -total, right: 0 }}
        dragElastic={{ left: 0.04, right: 0.06 }}
        onDragEnd={(_, info) => {
          const shouldOpen =
            info.offset.x < -total / 2 || info.velocity.x < -500;
          if (shouldOpen && !openRef.current) haptics.gesture();
          settle(shouldOpen ? -total : 0);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
