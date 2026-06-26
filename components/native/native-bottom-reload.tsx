"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { ArrowUp, Loader2 } from "lucide-react";
import { haptics } from "@/lib/native/haptics";
import { useLocale } from "@/components/i18n/locale-provider";

// Bottom pull-to-refresh — "上拉松手重新加载".
//
// Unlike the top UIRefreshControl (native Swift, needs a re-archive to change),
// this is implemented entirely in JS/touch events, so it ships as ordinary web
// content and updates the moment the site deploys — no App Store resubmission.
//
// Gesture: once the page is scrolled to the very bottom and the finger keeps
// dragging up (overscroll), an indicator rises from the bottom edge. Past the
// threshold a haptic fires and the label flips to "release to refresh";
// letting go then runs router.refresh() (re-runs the server components). It's
// disabled on the deck-style routes that own their own vertical gestures, the
// same ones the top pull-to-refresh skips.
const enabledPlatform = () =>
  Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

const NO_REFRESH_PREFIXES = ["/shoes/", "/smart-picker"];

const THRESHOLD = 72; // overscroll travel (px) needed to arm a refresh
const MAX_PULL = 132; // clamp so the indicator never wanders too far up
const RESISTANCE = 0.5; // finger distance → indicator travel (rubber-band feel)
const SNAP = "transform 220ms var(--ease), opacity 220ms var(--ease)";

type Phase = "idle" | "pull" | "armed" | "refreshing";

export function NativeBottomReload() {
  const pathname = usePathname();
  const router = useRouter();
  const { translate } = useLocale();

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

  // Keep the route-block flag current without re-binding the touch listeners.
  useEffect(() => {
    g.current.blocked = NO_REFRESH_PREFIXES.some((p) => pathname.startsWith(p));
  }, [pathname]);

  useEffect(() => {
    if (!enabledPlatform()) return;

    const atBottom = () =>
      window.scrollY + window.innerHeight >=
      document.documentElement.scrollHeight - 2;

    const paint = (travel: number) => {
      const el = pillRef.current;
      if (!el) return;
      el.style.transform = `translate(-50%, ${-travel}px)`;
      el.style.opacity = travel > 4 ? "1" : "0";
    };

    const onStart = (e: TouchEvent) => {
      const s = g.current;
      if (s.blocked || s.refreshing || e.touches.length !== 1) return;
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
        // Only begin tracking once pinned at the bottom and pulling upward.
        if (atBottom() && y < s.startY) {
          s.tracking = true;
          s.startY = y; // measure overscroll from the bottom edge
        } else {
          s.startY = y;
          return;
        }
      }

      const pulled = s.startY - y; // > 0 while pulling up
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
          el.style.transform = `translate(-50%, ${-THRESHOLD}px)`;
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

  if (!enabledPlatform()) return null;

  const label =
    phase === "refreshing"
      ? translate("Refreshing…")
      : phase === "armed"
        ? translate("Release to refresh")
        : translate("Pull up to refresh");

  return (
    <div
      ref={pillRef}
      aria-hidden
      className="pointer-events-none fixed left-1/2 z-[60] flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg backdrop-blur"
      style={{
        bottom: "calc(var(--mobile-nav-h) + 8px)",
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
        <ArrowUp
          className="h-4 w-4 transition-transform duration-200"
          style={{ transform: phase === "armed" ? "rotate(180deg)" : "none" }}
        />
      )}
      <span>{label}</span>
    </div>
  );
}
