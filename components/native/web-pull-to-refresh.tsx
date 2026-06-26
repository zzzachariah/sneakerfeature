"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { ArrowDown, Loader2 } from "lucide-react";
import { haptics } from "@/lib/native/haptics";
import { useLocale } from "@/components/i18n/locale-provider";

// Top pull-to-refresh — "下拉刷新", implemented in JS/touch events.
//
// Works on every platform except the iOS Capacitor native app when the
// NativeChrome plugin is present — that app gets a UIRefreshControl from
// NativePullToRefresh/native-gestures.tsx, so we defer to that to avoid
// double-firing. Every other surface (iOS Safari, Android Capacitor, web
// browsers) runs this JS implementation. Note: globals.css sets
// overscroll-behavior:none on body, so the browser's own pull-to-refresh is
// already suppressed everywhere — this JS handler is the only way to provide
// the gesture on those surfaces.
const enabledPlatform = () => {
  if (typeof window === "undefined") return false;
  // Skip only when the native UIRefreshControl is handling it.
  if (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "ios" &&
    Capacitor.isPluginAvailable("NativeChrome")
  ) return false;
  return true;
};

// Routes that run their own touch-driven gestures (image pan / deck swipe /
// chat scrollers); a downward drag there must not get hijacked into a refresh.
const NO_REFRESH_PREFIXES = ["/shoes/", "/smart-picker", "/foot-scan"];

const THRESHOLD = 72; // overscroll travel (px) needed to arm a refresh
const MAX_PULL = 132; // clamp so the indicator never wanders too far down
const RESISTANCE = 0.5; // finger distance → indicator travel (rubber-band feel)
const SNAP = "transform 220ms var(--ease), opacity 220ms var(--ease)";

type Phase = "idle" | "pull" | "armed" | "refreshing";

// True when `el` is a scroller whose content overflows AND it isn't already
// pinned at its own top — i.e. a downward drag would scroll it instead of
// pulling the page. Used to bail when the touch starts inside a modal / sheet /
// sidebar that has its own scroll position (window.scrollY stays 0 when body
// scroll is locked, so the cheap check isn't enough on its own).
function absorbsDownwardDrag(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight) return false;
  const overflowY = getComputedStyle(el).overflowY;
  if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") return false;
  return el.scrollTop > 0;
}

function startedInsideInnerScroller(target: EventTarget | null): boolean {
  let el = target instanceof HTMLElement ? target : null;
  while (el && el !== document.body) {
    if (absorbsDownwardDrag(el)) return true;
    el = el.parentElement;
  }
  return false;
}

export function WebPullToRefresh() {
  const pathname = usePathname();
  const router = useRouter();
  const { translate } = useLocale();

  // Defer rendering to after mount so SSR (always null) and the first client
  // render agree — otherwise non-iOS browsers / Android Capacitor would log a
  // hydration mismatch for the pill <div> on every cold page load.
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
    blocked: false,
    refreshing: false,
  });

  useEffect(() => {
    g.current.blocked = NO_REFRESH_PREFIXES.some((p) => pathname.startsWith(p));
  }, [pathname]);

  useEffect(() => {
    if (!enabledPlatform()) return;

    const atTop = () => window.scrollY <= 0;

    const paint = (travel: number) => {
      const el = pillRef.current;
      if (!el) return;
      el.style.transform = `translate(-50%, ${travel}px)`;
      el.style.opacity = travel > 4 ? "1" : "0";
    };

    const onStart = (e: TouchEvent) => {
      const s = g.current;
      if (s.blocked || s.refreshing || e.touches.length !== 1) return;
      // Bail if the touch began inside a modal / sheet / sidebar that owns its
      // own scroll — a downward drag there should scroll that container, not
      // pull the page. (Body-scroll-lock keeps window.scrollY at 0, so the
      // outer atTop() check below is true even when an overlay is open.)
      if (startedInsideInnerScroller(e.target)) {
        s.tracking = false;
        s.armed = false;
        // startY stays unused — onMove won't track unless onStart succeeded.
        return;
      }
      s.tracking = false;
      s.armed = false;
      s.startY = e.touches[0].clientY;
      if (pillRef.current) pillRef.current.style.transition = "none";
    };

    const onMove = (e: TouchEvent) => {
      const s = g.current;
      if (s.blocked || s.refreshing || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;

      if (!s.tracking) {
        // Only begin tracking once pinned at the top and pulling downward.
        if (atTop() && y > s.startY) {
          s.tracking = true;
          s.startY = y; // measure overscroll from the top edge
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
        // feel stuck (mirrors the native top control's 0.7s).
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

  if (!mounted || !enabledPlatform()) return null;

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
