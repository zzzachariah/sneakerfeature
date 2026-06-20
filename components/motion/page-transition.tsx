"use client";

import { useLayoutEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { consumeRouteDirection } from "@/lib/motion/route-direction";

// iOS-style screen transition. `app/template.tsx` remounts this on every
// navigation, so a fresh animation plays each time. We add the directional class
// in a layout effect (before paint) rather than rendering it, which (a) avoids a
// hydration mismatch — the server can't know the direction — and (b) means the
// CSS animation, not an inline transform, drives the slide. That matters: a CSS
// animation leaves NO residual transform when it ends, so `position: fixed`
// descendants keep working at rest (the reason the old template was opacity-only).
//
// Platform tuning:
//   • phones (web) + Android app → directional slide (forward / back).
//   • iOS app → forward slides; *back* just fades, because the native edge-swipe
//     already animates the WebView and we must not fight it.
//   • desktop web → a restrained fade (unchanged feel).
//   • cold start ("initial") and reduced-motion → fade / nothing.
function pickClass(dir: "forward" | "back" | "initial"): string {
  if (dir === "initial" || typeof window === "undefined") return "route-anim--fade";
  const platform = document.documentElement.dataset.nativePlatform; // "ios" | "android" | undefined
  const native = Boolean(platform);
  const phone = window.matchMedia("(max-width: 767.98px)").matches;
  const slide = native || phone;
  if (!slide) return "route-anim--fade";
  if (dir === "back") {
    // iOS hands back-navigation to the native swipe; don't double up.
    return platform === "ios" ? "route-anim--fade" : "route-anim--back";
  }
  return "route-anim--fwd";
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cls = pickClass(consumeRouteDirection());
    el.classList.add(cls);
    const cleanup = () => {
      el.classList.remove(cls);
      el.style.willChange = "";
    };
    el.addEventListener("animationend", cleanup, { once: true });
    return () => el.removeEventListener("animationend", cleanup);
    // Run once per mount (template gives us a fresh mount per navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return (
    <div ref={ref} className="route-anim">
      {children}
    </div>
  );
}
