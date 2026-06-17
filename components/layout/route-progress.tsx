"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

// A thin top progress bar that gives instant feedback the moment an internal link
// is tapped, so a slow (remote SSR) navigation never feels dead — which is what
// made people tap a sneaker several times. It starts on link click, fills as the
// navigation runs, and finishes when the route (pathname) actually changes; a
// safety timer always clears it so it can never get stuck.
export function RouteProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const trickleRef = useRef<number | null>(null);
  const safetyRef = useRef<number | null>(null);

  function clearTimers() {
    if (trickleRef.current) window.clearInterval(trickleRef.current);
    if (safetyRef.current) window.clearTimeout(safetyRef.current);
    trickleRef.current = null;
    safetyRef.current = null;
  }

  function start() {
    clearTimers();
    setVisible(true);
    setWidth(10);
    trickleRef.current = window.setInterval(() => {
      setWidth((w) => (w < 90 ? w + (90 - w) * 0.12 : w));
    }, 240);
    safetyRef.current = window.setTimeout(() => finish(), 8000);
  }

  function finish() {
    clearTimers();
    setWidth(100);
    window.setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 200);
  }

  // Start when an internal link is clicked (capture phase, before navigation).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const target = anchor.getAttribute("target");
      const hrefAttr = anchor.getAttribute("href");
      if (!hrefAttr || target === "_blank" || anchor.hasAttribute("download") || hrefAttr.startsWith("#")) return;
      let url: URL;
      try {
        url = new URL(hrefAttr, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname) return; // same page / hash only
      start();
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finish once the path actually changes.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => () => clearTimers(), []);

  if (!visible) return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 z-[100]" style={{ top: "var(--safe-top)" }}>
      <div
        className="h-0.5 bg-[rgb(var(--text))] transition-[width] duration-200 ease-out"
        style={{ width: `${width}%`, boxShadow: "0 0 8px rgb(var(--text) / 0.5)" }}
      />
    </div>
  );
}
