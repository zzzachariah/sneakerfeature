"use client";

import { useEffect, useRef, useState } from "react";

/** True when the user has requested reduced motion. SSR-safe. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * "In view" detection via IntersectionObserver.
 *
 * By default it's one-shot (the observer disconnects after first intersection)
 * — good for scroll-reveal that should only play once. Pass `{ repeat: true }`
 * to flip `inView` true/false every time the element enters/leaves the
 * viewport, so a progress-driven animation can replay each time it scrolls
 * back into view (e.g. the radar charts).
 */
export function useInView<T extends Element>(
  threshold = 0.15,
  opts: { repeat?: boolean } = {}
) {
  const { repeat = false } = opts;
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (!repeat) obs.disconnect();
        } else if (repeat) {
          setInView(false);
        }
      },
      { threshold }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [threshold, repeat]);
  return { ref, inView };
}

type ProgressOptions = {
  /** total animation duration in ms */
  duration?: number;
  /** delay before the animation starts in ms */
  delay?: number;
  /** ease-out power — higher is snappier at the end */
  power?: number;
};

/**
 * Eased progress value 0 -> 1 driven by `active`.
 *
 * Replays every time `active` transitions false -> true (resetting to 0 while
 * inactive), which is what lets slide-deck visuals (e.g. the radar charts)
 * re-animate each time you return to their slide rather than only once.
 * Honors prefers-reduced-motion by snapping straight to 1.
 */
export function useProgress(active: boolean, opts: ProgressOptions = {}) {
  const { duration = 720, delay = 220, power = 2.2 } = opts;
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) {
      // Reset so the next activation animates from the start.
      setValue(0);
      return;
    }
    if (prefersReducedMotion()) {
      setValue(1);
      return;
    }

    let raf = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const t = Math.min((now - start) / duration, 1);
      setValue(1 - Math.pow(1 - t, power));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    const timeout = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(raf);
    };
  }, [active, duration, delay, power]);

  return value;
}
