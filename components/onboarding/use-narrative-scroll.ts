"use client";

import { useCallback, useEffect, useRef } from "react";

/** Move only the bounded intro panel. Intent or departure always stops the move. */
export function useNarrativeScroll(reduced: boolean) {
  const cancel = useRef<() => void>(() => {});
  useEffect(() => () => cancel.current(), []);
  return useCallback((target: HTMLElement | null, align: boolean | "end" = false, delay = 0, duration = 1100): Promise<boolean> => {
    cancel.current();
    if (!target || document.hidden) return Promise.resolve(false);
    const boundary = target.closest<HTMLElement>("[data-onboarding-content]") ?? target;
    return new Promise(resolve => {
      let frame = 0;
      let timer = 0;
      let start = 0;
      let done = false;
      const finish = (completed: boolean) => {
        if (done) return;
        done = true;
        cancelAnimationFrame(frame); window.clearTimeout(timer);
        boundary.removeEventListener("wheel", stop, true);
        boundary.removeEventListener("touchstart", stop, true);
        boundary.removeEventListener("pointerdown", stop, true);
        document.removeEventListener("keydown", stop);
        document.removeEventListener("visibilitychange", stop);
        resolve(completed);
      };
      const stop = () => finish(false);
      cancel.current = stop;
      boundary.addEventListener("wheel", stop, { passive: true, capture: true });
      boundary.addEventListener("touchstart", stop, { passive: true, capture: true });
      boundary.addEventListener("pointerdown", stop, true);
      document.addEventListener("keydown", stop);
      document.addEventListener("visibilitychange", stop);
      timer = window.setTimeout(() => {
        const inner = target.closest<HTMLElement>("[data-narrative-scroll]");
        if (inner && inner.scrollHeight <= inner.clientHeight + 2) { finish(true); return; }
        let panel = inner ?? target.closest<HTMLElement>("[data-onboarding-story-scroll]");
        if (!panel || !/auto|scroll/.test(getComputedStyle(panel).overflowY) || panel.scrollHeight <= panel.clientHeight + 2) panel = target.closest<HTMLElement>("[data-onboarding-content]");
        if (!panel) { finish(true); return; }
        const scroller = panel;
        const from = scroller.scrollTop;
        const destination = () => align === true ? 0 : align === "end" ? Math.max(0, scroller.scrollHeight - scroller.clientHeight) : Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight,
          from + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12));
        const to = destination();
        if (reduced || Math.abs(to - from) < 2) { scroller.scrollTop = to; finish(true); return; }
        const tick = (now: number) => {
          start ||= now;
          const t = Math.min(1, (now - start) / duration);
          const eased = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
          scroller.scrollTop = from + ((align === "end" ? destination() : to) - from) * eased;
          if (t < 1) frame = requestAnimationFrame(tick);
          else finish(true);
        };
        frame = requestAnimationFrame(tick);
      }, reduced ? 0 : delay);
    });
  }, [reduced]);
}
