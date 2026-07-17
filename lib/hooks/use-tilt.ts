"use client";

// Pointer-driven 3D tilt. Writes --tilt-x / --tilt-y onto the hovered element,
// which the `.tilt-3d` class in globals.css turns into a perspective rotation.
// rAF-batched so pointermove never thrashes layout, and inert on touch / when
// the user prefers reduced motion (the CSS also zeroes .tilt-3d there, so this
// is belt-and-braces). Mirrors the handler the auth pages use, lifted into a
// shared hook so the membership card gets the same restrained motion system.

import { useCallback, useEffect, useRef } from "react";

export function useTilt(maxDeg = 5) {
  const rafRef = useRef(0);
  const pending = useRef<{ el: HTMLElement; tx: number; ty: number; fx: number; fy: number } | null>(null);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const flush = useCallback(() => {
    rafRef.current = 0;
    const p = pending.current;
    if (!p) return;
    p.el.style.setProperty("--tilt-y", `${p.ty}deg`);
    p.el.style.setProperty("--tilt-x", `${p.tx}deg`);
    // Normalized pointer position (0–100%) so a holographic foil layer can track
    // the light source to the cursor. Kept in sync with the same rAF tick.
    p.el.style.setProperty("--foil-x", `${p.fx}%`);
    p.el.style.setProperty("--foil-y", `${p.fy}%`);
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      if (typeof window === "undefined") return;
      if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / rect.width - 0.5;
      const ny = (e.clientY - rect.top) / rect.height - 0.5;
      pending.current = { el, ty: nx * maxDeg * 2, tx: ny * -maxDeg * 2, fx: (nx + 0.5) * 100, fy: (ny + 0.5) * 100 };
      if (!rafRef.current) rafRef.current = requestAnimationFrame(flush);
    },
    [flush, maxDeg]
  );

  const onPointerLeave = useCallback((e: React.PointerEvent<HTMLElement>) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pending.current = null;
    const el = e.currentTarget;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
    el.style.setProperty("--foil-x", "50%");
    el.style.setProperty("--foil-y", "50%");
  }, []);

  return { onPointerMove, onPointerLeave };
}
