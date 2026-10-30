"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type ComparisonPhase = "rest" | "preparing" | "dimming" | "moving" | "shoes" | "radar" | "copy" | "details";
const EASE = "cubic-bezier(.4, 0, .2, 1)";
const TIMES = { dim: 900, travel: 1600, shoes: 900, radar: 1150, copy: 900, details: 650 };

// Measure the painted image, not its object-fit box. This keeps the shoes at
// their natural proportions even when the two layouts have different ratios.
function imageRect(image: HTMLImageElement) {
  const box = image.getBoundingClientRect();
  const ratio = image.naturalWidth / image.naturalHeight || box.width / box.height;
  const width = Math.min(box.width, box.height * ratio);
  const height = width / ratio;
  return { left: box.left + (box.width - width) / 2, top: box.top + (box.height - height) / 2, width, height };
}

type Run = { abort: AbortController; arrive: () => void; cleanup: () => void };

export function useComparisonEntrance({ root, enabled, reduced, onArrive }: {
  root: RefObject<HTMLDivElement | null>; enabled: boolean; reduced: boolean | null; onArrive: () => void;
}) {
  const [phase, setPhase] = useState<ComparisonPhase>("rest");
  const run = useRef<Run | null>(null);
  const wasBusy = useRef(false);
  const latest = useRef({ enabled, reduced, onArrive });
  latest.current = { enabled, reduced, onArrive };

  useEffect(() => {
    if (phase === "rest" && wasBusy.current && enabled) root.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
    wasBusy.current = phase !== "rest";
  }, [phase, enabled, root]);

  const cancel = useCallback((settle = false) => {
    const current = run.current;
    if (!current) return;
    run.current = null;
    current.abort.abort();
    current.cleanup();
    if (settle && latest.current.enabled) current.arrive();
    setPhase("rest");
  }, []);

  useEffect(() => { if (!enabled) cancel(); else if (reduced) cancel(true); }, [enabled, reduced, cancel]);
  useEffect(() => {
    // A changed viewport invalidates the measured endpoints. Settle into the
    // responsive layout rather than leaving a stale image or a blocking veil.
    const settle = () => cancel(true);
    const visibility = () => { if (document.hidden) settle(); };
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motionPreference = () => { if (preference.matches) settle(); };
    window.addEventListener("resize", settle);
    window.visualViewport?.addEventListener("resize", settle);
    document.addEventListener("visibilitychange", visibility);
    preference.addEventListener("change", motionPreference);
    return () => {
      window.removeEventListener("resize", settle);
      window.visualViewport?.removeEventListener("resize", settle);
      document.removeEventListener("visibilitychange", visibility);
      preference.removeEventListener("change", motionPreference);
      cancel();
    };
  }, [cancel]);

  const start = useCallback(() => {
    if (run.current || !latest.current.enabled) return;
    const shell = root.current;
    const sources = Array.from(shell?.querySelectorAll<HTMLImageElement>("img[data-comparison-source]") ?? []);
    if (!shell || sources.length !== 2 || latest.current.reduced || window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof Element.prototype.animate !== "function") {
      latest.current.onArrive();
      return;
    }
    const abort = new AbortController();
    const animations = new Set<Animation>();
    const hidden = new Map<HTMLElement, string>();
    let overlay: HTMLDivElement | null = null;
    let arrived = false;
    const current: Run = {
      abort,
      arrive: () => { if (!arrived) { arrived = true; latest.current.onArrive(); } },
      cleanup: () => {
        animations.forEach(animation => animation.cancel());
        animations.clear();
        hidden.forEach((visibility, node) => { node.style.visibility = visibility; });
        hidden.clear();
        overlay?.remove();
      }
    };
    run.current = current;
    setPhase("preparing");
    const guard = () => { if (abort.signal.aborted) throw new DOMException("Cancelled", "AbortError"); };
    const hide = (node: HTMLElement) => { hidden.set(node, node.style.visibility); node.style.visibility = "hidden"; };
    const frame = () => new Promise<void>((resolve, reject) => {
      guard();
      const onAbort = () => { cancelAnimationFrame(id); reject(new DOMException("Cancelled", "AbortError")); };
      const id = requestAnimationFrame(() => { abort.signal.removeEventListener("abort", onAbort); resolve(); });
      abort.signal.addEventListener("abort", onAbort, { once: true });
    });
    const animate = async (node: HTMLElement, frames: Keyframe[], duration: number, easing = EASE) => {
      guard();
      const animation = node.animate(frames, { duration, easing, fill: "forwards" });
      animations.add(animation);
      await animation.finished;
      guard();
    };
    const hold = async (duration: number) => {
      const began = performance.now();
      while (performance.now() - began < duration) await frame();
      guard();
    };

    void (async () => {
      // A quick Next click may arrive while the wall-to-selection flight is
      // still landing. Let that real image finish before taking ownership.
      const began = performance.now();
      while (sources.some(node => Number(getComputedStyle(node).opacity) < .99) && performance.now() - began < 1300) await frame();
      guard();
      overlay = document.createElement("div");
      overlay.dataset.comparisonOverlay = "true";
      overlay.setAttribute("aria-hidden", "true");
      Object.assign(overlay.style, { position: "fixed", inset: "0", zIndex: "160", overflow: "hidden", pointerEvents: "auto" });
      const veil = document.createElement("div");
      veil.dataset.comparisonVeil = "true";
      Object.assign(veil.style, { position: "absolute", inset: "0", background: getComputedStyle(shell).backgroundColor, opacity: "0" });
      overlay.appendChild(veil);
      const flights = sources.map(source => {
        const from = imageRect(source);
        const image = source.cloneNode(false) as HTMLImageElement;
        image.removeAttribute("class");
        image.removeAttribute("data-comparison-source");
        image.removeAttribute("data-shoe-landing");
        image.alt = "";
        image.dataset.comparisonFlight = source.dataset.comparisonSource;
        Object.assign(image.style, { position: "absolute", left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px`, maxWidth: "none", margin: "0", objectFit: "contain", transformOrigin: "0 0", filter: getComputedStyle(source).filter, willChange: "transform" });
        overlay!.appendChild(image);
        return { image, source, from };
      });
      document.body.appendChild(overlay);
      sources.forEach(hide);
      setPhase("dimming");
      await animate(veil, [{ opacity: 0 }, { opacity: 1 }], TIMES.dim);
      current.arrive();
      setPhase("moving");
      await frame();
      await frame();
      const targets = Array.from(shell.querySelectorAll<HTMLImageElement>("[data-comparison-target] img"));
      const journeys = flights.map(({ image, source, from }) => {
        const target = targets.find(node => node.parentElement?.dataset.comparisonTarget === source.dataset.comparisonSource);
        if (!target) throw new Error("Comparison image unavailable");
        const to = imageRect(target);
        if (!to.width || !to.height) throw new Error("Comparison image has no layout");
        hide(target);
        return animate(image, [{ transform: "translate(0, 0) scale(1)" }, { transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`, filter: getComputedStyle(target).filter }], TIMES.travel, "cubic-bezier(.65, 0, .35, 1)");
      });
      await Promise.all(journeys);
      setPhase("shoes");
      await animate(veil, [{ opacity: 1 }, { opacity: 0 }], TIMES.shoes);
      // Transfer ownership at the measured landing positions, then start the
      // site's existing radar drawing. It has not played behind the curtain.
      current.cleanup();
      setPhase("radar");
      await hold(TIMES.radar);
      setPhase("copy");
      await hold(TIMES.copy);
      setPhase("details");
      await hold(TIMES.details);
      if (run.current === current) {
        run.current = null;
        setPhase("rest");
      }
    })().catch(() => {
      if (run.current === current) cancel(true);
    });
  }, [root, cancel]);

  return { phase, busy: phase !== "rest", start, cancel };
}
