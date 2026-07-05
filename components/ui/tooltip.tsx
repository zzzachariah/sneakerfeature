"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Hover/focus label for navbar icon buttons.
 *
 * Instead of floating an absolute bubble ON TOP of the neighbouring icons, the
 * label lives IN FLOW next to its icon and expands from zero width on hover /
 * focus — so the surrounding icons smoothly slide aside to make room and slide
 * back when the pointer leaves. The width animation uses the grid `0fr → 1fr`
 * technique (GPU-friendly, animates to the label's natural width) and the pill
 * fades in over it. Respects reduced-motion.
 */
export function Tooltip({
  label,
  children,
  side = "left",
  className
}: {
  label: ReactNode;
  children: ReactNode;
  side?: "left" | "right";
  className?: string;
}) {
  const labelEl = (
    <span
      aria-hidden
      className={cn(
        "grid grid-cols-[0fr] transition-[grid-template-columns] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        "group-hover/nav-tip:grid-cols-[1fr] group-[:has(:focus-visible)]/nav-tip:grid-cols-[1fr]"
      )}
    >
      <span className="overflow-hidden">
        <span
          className={cn(
            "nav-dropdown-panel block whitespace-nowrap rounded-full px-2.5 py-1 text-[0.72rem] font-medium text-[rgb(var(--text))]",
            "opacity-0 transition-opacity duration-150 group-hover/nav-tip:opacity-100 group-[:has(:focus-visible)]/nav-tip:opacity-100 motion-reduce:transition-none",
            side === "left" ? "mr-1.5" : "ml-1.5"
          )}
        >
          {label}
        </span>
      </span>
    </span>
  );

  return (
    <span className={cn("group/nav-tip inline-flex items-center", className)}>
      {side === "left" ? labelEl : null}
      {children}
      {side === "right" ? labelEl : null}
    </span>
  );
}
