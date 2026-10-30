"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./scroll-hint.module.css";

/** Short cards scroll their heading and fields together, without remounting drafts. */
export function useFormScroll() {
  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [short, setShort] = useState(false);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      if (root.clientHeight > 0) setShort(root.clientHeight <= 210);
    };
    const resize = new ResizeObserver(measure);
    resize.observe(root);
    measure();
    return () => resize.disconnect();
  }, []);
  return { rootRef, viewportRef, scrollRef, targetRef: short ? viewportRef : scrollRef, short };
}

/** A quiet cue only while this panel has content below its visible edge. */
export function ScrollHint({ targetRef, zh, compact: forceCompact = false }: { targetRef: RefObject<HTMLElement | null>; zh: boolean; compact?: boolean }) {
  const marker = useRef<HTMLDivElement>(null);
  const [{ more, compact }, setHint] = useState({ more: false, compact: false });
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const next = {
        more: target.clientHeight >= 32 && target.scrollHeight - target.clientHeight - target.scrollTop > 16,
        compact: forceCompact || target.clientHeight < 140 || target.clientWidth < 210
      };
      setHint(current => current.more === next.more && current.compact === next.compact ? current : next);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const observe = () => {
      resize.disconnect();
      resize.observe(target);
      Array.from(target.children).forEach(child => { if (child !== marker.current) resize.observe(child); });
      schedule();
    };
    const children = new MutationObserver(observe);
    children.observe(target, { childList: true, subtree: true });
    observe();
    target.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect(); children.disconnect();
      target.removeEventListener("scroll", schedule);
    };
  }, [targetRef, forceCompact]);
  return <div ref={marker} className={styles.hint} data-scroll-hint data-visible={more} data-compact={compact} aria-hidden="true">
    <span><span>{zh ? "向下查看更多" : "Scroll for more"}</span><ChevronDown size={13}/></span>
  </div>;
}
