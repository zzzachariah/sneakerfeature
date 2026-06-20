"use client";

import { useEffect, useState } from "react";
import { animate, useMotionValue, useTransform } from "framer-motion";

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
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (latest) => Math.round(latest).toLocaleString());
  const [display, setDisplay] = useState<string>("0");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    const unsubscribe = rounded.on("change", (latest) => setDisplay(latest));
    return () => unsubscribe();
  }, [rounded]);

  useEffect(() => {
    if (reduced) {
      motionValue.set(value);
      setDisplay(value.toLocaleString());
      return;
    }
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.22, 1, 0.36, 1]
    });
    return controls.stop;
  }, [value, duration, reduced, motionValue]);

  return <span className={`num-display ${className ?? ""}`.trim()}>{display}</span>;
}
