"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Lightweight, CSS-only hover/focus tooltip for navbar icon buttons.
 *
 * The label is absolutely positioned beside the trigger and unfurls horizontally
 * (frosted-glass pill matching the dropdown menus). Because the bubble is
 * `absolute` + `pointer-events-none`, it never affects layout and never steals the
 * cursor — so hovering across the icon row stays perfectly still (no jitter/flicker).
 * The reveal animates opacity + transform only, for a smooth GPU-composited feel.
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
  return (
    <span className={cn("group/nav-tip relative inline-flex", className)}>
      {children}
      <span
        role="tooltip"
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 z-[80] -translate-y-1/2 whitespace-nowrap rounded-full px-3 py-1 text-[0.72rem] font-medium text-[rgb(var(--text))]",
          "nav-dropdown-panel opacity-0 scale-95",
          "transition-[opacity,transform] duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
          "group-hover/nav-tip:translate-x-0 group-hover/nav-tip:scale-100 group-hover/nav-tip:opacity-100",
          "group-focus-within/nav-tip:translate-x-0 group-focus-within/nav-tip:scale-100 group-focus-within/nav-tip:opacity-100",
          side === "left"
            ? "right-[calc(100%+0.4rem)] origin-right translate-x-1.5"
            : "left-[calc(100%+0.4rem)] origin-left -translate-x-1.5"
        )}
      >
        {label}
      </span>
    </span>
  );
}
