"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown } from "lucide-react";
import styles from "./scroll-hint.module.css";

/** A quiet cue only while this panel has content below its visible edge. */
export function ScrollHint({ targetRef, zh }: { targetRef: RefObject<HTMLElement | null>; zh: boolean }) {
  const marker = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const target = targetRef.current;
    if (!target) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      setMore(target.clientHeight > 0 && target.scrollHeight - target.clientHeight - target.scrollTop > 16);
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
  }, [targetRef]);
  return <div ref={marker} className={styles.hint} data-scroll-hint data-visible={more} aria-hidden="true">
    <span><span>{zh ? "向下查看更多" : "Scroll for more"}</span><ChevronDown size={13}/></span>
  </div>;
}
