"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import styles from "./animated-count.module.css";

const CountProgress = createContext(1);
/** All figures in a group use one clock and reach their real values together. */
export function CountReveal({ children, runKey, active = true }: { children: ReactNode; runKey: string | number; active?: boolean }) {
  const reduced = useReducedMotion();
  const [progress, setProgress] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (!active) { setProgress(0); return; }
    if (reduced) { setProgress(1); return; }
    let frame = 0;
    let start: number | null = null;
    let previous = -100;
    setProgress(0);
    const tick = (now: number) => {
      start ??= now;
      const elapsed = now - start;
      const t = Math.min(1, elapsed / 1120);
      // Update at 20Hz while the digit tracks interpolate on the compositor.
      // The final 80ms settle gives every number the same 1.2 second finish.
      if (now - previous >= 50 || t === 1) {
        previous = now;
        setProgress(t === 1 ? 1 : 1 - Math.pow(1 - t, 3));
      }
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [runKey, reduced, active]);
  return <CountProgress.Provider value={progress}>{children}</CountProgress.Provider>;
}

export function AnimatedCount({ value, prefix = "", pad = 0 }: { value: number; prefix?: string; pad?: number }) {
  const progress = useContext(CountProgress);
  const reduced = useReducedMotion();
  const actual = Math.max(0, Math.floor(value));
  const final = pad ? String(actual).padStart(pad, "0") : actual.toLocaleString("en-US");
  const targetDigits = final.replace(/\D/g, "").length;
  const shown = String(progress === 1 ? actual : Math.floor(actual * progress)).padStart(targetDigits, "0");
  let index = 0;
  return <span className={styles.number} aria-label={prefix + final}>
    <span aria-hidden="true">{prefix}</span>
    {Array.from(final).map((character, position) => {
      if (!/\d/.test(character)) return <span aria-hidden="true" key={position}>{character}</span>;
      const digit = Number(shown[index++]);
      return <span className={styles.window} aria-hidden="true" key={position}>
        <span className={styles.track} style={{ transform: `translateY(-${digit * 10}%)`, transitionDuration: reduced ? "0ms" : "80ms" }}>
          {Array.from({ length: 10 }, (_, n) => <span key={n}>{n}</span>)}
        </span>
      </span>;
    })}
  </span>;
}
