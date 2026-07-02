"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealProps = {
  children: ReactNode;
  /** element to render, e.g. "li" inside a <ul>. Defaults to "div". */
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  /** stagger order — multiplied by `stagger` to offset the delay */
  index?: number;
  /** ms added per `index` for staggered lists. Default 50. */
  stagger?: number;
  /** base delay in ms before this item animates. Default 0. */
  delay?: number;
  /** vertical travel in px. Default 8. */
  y?: number;
  /**
   * IntersectionObserver rootMargin. Defaults to "0px"; pass a positive value
   * (e.g. "600px 0px") to trip the reveal BEFORE the element enters viewport
   * — needed for fast-scrolled lists where waiting until the element is
   * actually visible would leave it stuck at opacity 0.
   */
  rootMargin?: string;
  /**
   * When provided, drives the reveal off slide-active state and REPLAYS each
   * time it flips false -> true. When omitted, falls back to a
   * scroll-into-view reveal via IntersectionObserver that replays on every
   * entry (see `once` to opt out).
   */
  active?: boolean;
  /**
   * Scroll mode only: play just the first time the element enters the
   * viewport instead of replaying on every scroll-into-view. Default false.
   */
  once?: boolean;
};

/**
 * Tasteful entrance primitive: fades + slides content in, with optional
 * stagger. Pairs with the `.reveal` / `revealUp` CSS in globals.css, which
 * fully disables itself under prefers-reduced-motion.
 */
export function Reveal({
  children,
  as: Tag = "div",
  className,
  style,
  index = 0,
  stagger = 50,
  delay = 0,
  y = 8,
  rootMargin = "0px",
  active,
  once = false,
}: RevealProps) {
  const driveByActive = active !== undefined;
  const nodeRef = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(false);
  // Bumping this key remounts the element so the CSS animation replays.
  const [replay, setReplay] = useState(0);

  const setRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node;
  }, []);

  // Scroll-into-view when not driven by `active`. By default the element
  // resets once it has (almost) fully left the viewport, so removing and
  // re-adding `.reveal-in` replays the CSS animation on every re-entry —
  // scrolling back up re-animates just like the first pass. The reset happens
  // at <1% visibility, so it's never seen. `once` restores the old fire-and-
  // disconnect behavior.
  useEffect(() => {
    if (driveByActive) return;
    const node = nodeRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          if (once) obs.disconnect();
        } else if (!once) {
          setShown(false);
        }
      },
      { threshold: 0.01, rootMargin }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [driveByActive, rootMargin, once]);

  // Active-driven: replay each time the slide/section becomes active.
  useEffect(() => {
    if (!driveByActive) return;
    if (active) {
      setShown(true);
      setReplay((r) => r + 1);
    } else {
      setShown(false);
    }
  }, [driveByActive, active]);

  const revealStyle = {
    ...style,
    "--reveal-delay": `${delay + index * stagger}ms`,
    "--reveal-y": `${y}px`,
  } as CSSProperties;

  return (
    <Tag
      key={driveByActive ? replay : undefined}
      ref={driveByActive ? undefined : setRef}
      className={cn("reveal", shown && "reveal-in", className)}
      style={revealStyle}
    >
      {children}
    </Tag>
  );
}
