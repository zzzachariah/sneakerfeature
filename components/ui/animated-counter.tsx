"use client";

import { useEffect, useRef, useState } from "react";

// Cubic-bezier easing matching the original [0.22, 1, 0.36, 1] curve.
// Uses a simple approximation: ease-out quartic gives a visually equivalent feel.
function easeOutQuart(t: number): number {
  return 1 - Math.pow(1 - t, 4);
}

export function AnimatedCounter({
  value,
  duration = 1.2,
  className
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const [reduced, setReduced] = useState(false);
  const [display, setDisplay] = useState<string>("0");
  const rafRef = useRef<number | null>(null);
  const fromRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (reduced) {
      fromRef.current = value;
      setDisplay(value.toLocaleString());
      return;
    }

    const from = fromRef.current;
    const to = value;
    const durationMs = duration * 1000;
    const startTime = performance.now();

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = easeOutQuart(progress);
      const current = Math.round(from + (to - from) * eased);
      setDisplay(current.toLocaleString());
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        rafRef.current = null;
      }
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [value, duration, reduced]);

  return <span className={`num-display ${className ?? ""}`.trim()}>{display}</span>;
}
