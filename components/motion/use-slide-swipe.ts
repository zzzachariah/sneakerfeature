"use client";

import { useEffect, type RefObject } from "react";

type Opts = {
  /** the translated slide track element */
  trackRef: RefObject<HTMLElement | null>;
  /** current slide index (ref, read live during the gesture) */
  slideRef: RefObject<number>;
  /** true while a slide transition is animating (block drag mid-flight) */
  animatingRef: RefObject<boolean>;
  total: number;
  ease: string;
  durationMs: number;
  /** selector for inner scrollable areas that should scroll instead of paging */
  scrollSelector: string;
  /** optional selector; gestures starting on a match never page (e.g. form controls) */
  blockSelector?: string;
  /** px the finger must travel to commit a slide change */
  threshold: number;
  goTo: (next: number) => void;
};

function canSelfScroll(el: HTMLElement | null, dy: number): boolean {
  if (!el) return false;
  if (el.scrollHeight <= el.clientHeight) return false;
  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  if (dy > 0 && !atBottom) return true;
  if (dy < 0 && !atTop) return true;
  return false;
}

/**
 * Finger-follow swipe for the vertical slide decks. The track follows the
 * finger in real time via an imperative `--drag-offset` CSS variable (so the
 * heavy slide children never re-render mid-gesture), rubber-bands at the
 * edges, and snaps — committing a slide change past `threshold`. Inner
 * scrollable areas keep scrolling natively; we only page when they can't.
 */
export function useSlideSwipe({
  trackRef,
  slideRef,
  animatingRef,
  total,
  ease,
  durationMs,
  scrollSelector,
  blockSelector,
  threshold,
  goTo,
}: Opts) {
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let startY = 0;
    let lastDy = 0;
    let scroller: HTMLElement | null = null;
    let dragging = false;
    let blocked = false;

    const drag = (px: number) => {
      track.style.transition = "none";
      track.style.setProperty("--drag-offset", `${px}px`);
    };
    const release = () => {
      track.style.transition = `transform ${durationMs}ms ${ease}`;
      track.style.setProperty("--drag-offset", "0px");
    };

    const onStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      blocked = blockSelector ? Boolean(target?.closest(blockSelector)) : false;
      scroller = (target?.closest(scrollSelector) as HTMLElement | null) ?? null;
      startY = e.touches[0]?.clientY ?? 0;
      lastDy = 0;
      dragging = false;
    };

    const onMove = (e: TouchEvent) => {
      if (animatingRef.current || blocked) return;
      const y = e.touches[0]?.clientY ?? 0;
      const dy = startY - y; // +ve = finger up = toward next slide
      // Let an inner area scroll while it still can in this direction.
      if (scroller && canSelfScroll(scroller, dy)) {
        if (dragging) {
          dragging = false;
          release();
        }
        return;
      }
      if (!dragging && Math.abs(dy) < 4) return;
      dragging = true;
      lastDy = dy;
      let offset = -dy; // content follows the finger
      const atFirst = (slideRef.current ?? 0) <= 0;
      const atLast = (slideRef.current ?? 0) >= total - 1;
      if ((atFirst && offset > 0) || (atLast && offset < 0)) offset *= 0.35; // rubber-band
      drag(offset);
      if (e.cancelable) e.preventDefault();
    };

    const onEnd = () => {
      const wasDragging = dragging;
      const dy = lastDy;
      dragging = false;
      lastDy = 0;
      release();
      if (wasDragging && Math.abs(dy) >= threshold) {
        if (dy > 0) goTo((slideRef.current ?? 0) + 1);
        else goTo((slideRef.current ?? 0) - 1);
      }
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [trackRef, slideRef, animatingRef, total, ease, durationMs, scrollSelector, blockSelector, threshold, goTo]);
}
