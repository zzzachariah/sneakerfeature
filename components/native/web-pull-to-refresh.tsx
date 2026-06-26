"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, Loader2 } from "lucide-react";
import { haptics } from "@/lib/native/haptics";
import { useLocale } from "@/components/i18n/locale-provider";

// Top pull-to-refresh — "下拉刷新", implemented in JS/touch events.
//
// Runs on EVERY platform — iOS Capacitor app, Android Capacitor, mobile web,
// desktop. Pages here often use inner overflow-y-auto viewports rather than
// scrolling the outer document, which is why the native iOS UIRefreshControl
// (attached to the WKWebView's outer scrollView) never fired in practice. This
// handler walks up from the touch target to find whichever element is actually
// scrolling, and only arms when THAT scroller is pinned at its top — so the
// gesture works regardless of whether scrolling lives on the document or in
// some inner panel.
//
// No route exclusion list: the per-scroller check below also bails when the
// touch starts inside a modal / sheet / sidebar / image-pan area whose own
// scroller can absorb the drag, so deck pages and the foot-scan editor don't
// get hijacked.

const THRESHOLD = 72; // overscroll travel (px) needed to arm a refresh
const MAX_PULL = 132; // clamp so the indicator never wanders too far down
const RESISTANCE = 0.5; // finger distance → indicator travel (rubber-band feel)
const SNAP = "transform 220ms var(--ease), opacity 220ms var(--ease)";

type Phase = "idle" | "pull" | "armed" | "refreshing";

// True when `el` is a scrollable container — content overflows AND its
// computed overflow-y allows it to scroll.
function isScrollable(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight) return false;
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

// Find the nearest ancestor that actually scrolls (walking from the touch
// target up). Falls back to the documentElement when nothing inner scrolls —
// which matches what `window.scrollY` reports anyway.
function findScroller(target: EventTarget | null): HTMLElement {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body) {
    if (isScrollable(el)) return el;
    el = el.parentElement;
  }
  return document.scrollingElement as HTMLElement ?? document.documentElement;
}

export function WebPullToRefresh() {
  const router = useRouter();
  const { translate } = useLocale();

  // Defer rendering to after mount so SSR (always null) and the first client
  // render agree — otherwise we'd log a hydration mismatch for the pill <div>
  // on every cold page load.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [phase, setPhase] = useState<Phase>("idle");
  const pillRef = useRef<HTMLDivElement>(null);

  // Mutable gesture state in a ref so the touch handlers never go stale and
  // never re-render mid-drag.
  const g = useRef({
    tracking: false,
    startY: 0,
    armed: false,
    refreshing: false,
    scroller: null as HTMLElement | null,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const paint = (travel: number) => {
      const el = pillRef.current;
      if (!el) return;
      el.style.transform = `translate(-50%, ${travel}px)`;
      el.style.opacity = travel > 4 ? "1" : "0";
    };

    const onStart = (e: TouchEvent) => {
      const s = g.current;
      if (s.refreshing || e.touches.length !== 1) return;
      // Lock onto whichever container is doing the scrolling at the touch
      // point. If it's NOT pinned at its top, abort — the drag belongs to that
      // scroller, not pull-to-refresh.
      const scroller = findScroller(e.target);
      if (scroller.scrollTop > 0) {
        s.tracking = false;
        s.armed = false;
        s.scroller = null;
        return;
      }
      s.scroller = scroller;
      s.tracking = false;
      s.armed = false;
      s.startY = e.touches[0].clientY;
      if (pillRef.current) pillRef.current.style.transition = "none";
    };

    const onMove = (e: TouchEvent) => {
      const s = g.current;
      if (s.refreshing || e.touches.length !== 1 || !s.scroller) return;
      const y = e.touches[0].clientY;

      if (!s.tracking) {
        // Only begin tracking once the scroller is still at its top AND the
        // finger is moving downward.
        if (s.scroller.scrollTop <= 0 && y > s.startY) {
          s.tracking = true;
          s.startY = y; // measure overscroll from the moment we lock in
        } else {
          s.startY = y;
          return;
        }
      }

      const pulled = y - s.startY; // > 0 while pulling down
      if (pulled <= 0) {
        // Reversed direction — drop the baseline back to the finger.
        s.startY = y;
        s.armed = false;
        paint(0);
        setPhase("idle");
        return;
      }

      const travel = Math.min(pulled * RESISTANCE, MAX_PULL);
      paint(travel);

      const nowArmed = travel >= THRESHOLD;
      if (nowArmed && !s.armed) haptics.gesture();
      s.armed = nowArmed;
      setPhase(nowArmed ? "armed" : "pull");
    };

    const onEnd = () => {
      const s = g.current;
      const el = pillRef.current;
      if (el) el.style.transition = SNAP;

      if (s.tracking && s.armed && !s.refreshing) {
        s.refreshing = true;
        setPhase("refreshing");
        if (el) {
          el.style.transform = `translate(-50%, ${THRESHOLD}px)`;
          el.style.opacity = "1";
        }
        router.refresh();
        // router.refresh() gives no completion signal, so clear after a short
        // beat — long enough to read as a real reload, short enough to never
        // feel stuck.
        window.setTimeout(() => {
          s.refreshing = false;
          setPhase("idle");
          paint(0);
        }, 800);
      } else {
        setPhase("idle");
        paint(0);
      }
      s.tracking = false;
      s.armed = false;
      s.scroller = null;
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  if (!mounted) return null;

  const label =
    phase === "refreshing"
      ? translate("Refreshing…")
      : phase === "armed"
        ? translate("Release to refresh")
        : translate("Pull down to refresh");

  return (
    <div
      ref={pillRef}
      aria-hidden
      className="pointer-events-none fixed left-1/2 z-[60] flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur"
      style={{
        // Use --safe-top (not env() directly) so the Android floor from
        // globals.css applies — under Capacitor 8 edge-to-edge the WebView
        // reports env(safe-area-inset-*) unreliably.
        top: "calc(var(--safe-top) + 8px)",
        transform: "translate(-50%, 0)",
        opacity: 0,
        willChange: "transform, opacity",
        background: "rgb(var(--bg-elev) / 0.92)",
        color: "rgb(var(--text))",
        boxShadow: "0 6px 24px rgb(var(--shadow) / 0.18)",
      }}
    >
      {phase === "refreshing" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <ArrowDown
          className="h-4 w-4 transition-transform duration-200"
          style={{ transform: phase === "armed" ? "rotate(180deg)" : "none" }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}

