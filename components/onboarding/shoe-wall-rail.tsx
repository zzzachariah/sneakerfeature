"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { animate, type AnimationPlaybackControls } from "framer-motion";
import { EASE } from "@/lib/motion/constants";
import { shiftWallTimeline } from "@/lib/onboarding/wall-motion";
import styles from "./discovery-intro.module.css";

/** The CSS conveyor never pauses: gestures scrub its phase, then ease away. */
export function ShoeWallRail({ children, duration, reduced, label }: {
  children: ReactNode; duration: number; reduced: boolean; label: string;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const motion = useRef<{ animation: Animation; cycle: number; duration: number } | null>(null);
  const momentum = useRef<AnimationPlaybackControls | null>(null);
  const pointer = useRef<{ id: number; originX: number; originY: number; x: number; time: number; velocity: number; dragged: boolean } | null>(null);
  const suppressClick = useRef(false);
  const prepare = useCallback(() => {
    momentum.current?.stop();
    const animation = track.current?.getAnimations()[0];
    const cycle = track.current?.firstElementChild?.getBoundingClientRect().width ?? 0;
    const time = Number(animation?.effect?.getTiming().duration);
    motion.current = !reduced && animation && cycle > 0 && time > 0 ? { animation, cycle, duration: time } : null;
  }, [reduced]);
  const move = useCallback((deltaX: number) => {
    const run = motion.current;
    if (run && typeof run.animation.currentTime === "number") {
      run.animation.currentTime = shiftWallTimeline(run.animation.currentTime, deltaX, run.cycle, run.duration);
    } else if (rail.current) rail.current.scrollLeft -= deltaX;
  }, []);
  const glide = useCallback((distance: number) => {
    if (reduced) return;
    let previous = 0;
    momentum.current = animate(0, distance, { duration: .75, ease: EASE, onUpdate: value => { move(value - previous); previous = value; } });
  }, [move, reduced]);
  const release = useCallback((id: number, cancelled = false) => {
    const state = pointer.current;
    if (!state || id !== state.id) return;
    pointer.current = null;
    rail.current?.removeAttribute("data-dragging");
    if (rail.current?.hasPointerCapture(id)) rail.current.releasePointerCapture(id);
    if (state.dragged && !cancelled) {
      // A held finger should release into the normal drift, without a fling.
      const velocity = performance.now() - state.time < 100 ? state.velocity : 0;
      glide(Math.max(-1.5, Math.min(1.5, velocity)) * 180);
    }
  }, [glide]);
  useEffect(() => {
    const node = rail.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      const horizontal = event.shiftKey ? event.deltaY : event.deltaX;
      if (!horizontal || (!event.shiftKey && Math.abs(horizontal) <= Math.abs(event.deltaY))) return;
      event.preventDefault();
      prepare();
      move(-horizontal * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientWidth : 1));
    };
    const cancel = () => {
      momentum.current?.stop();
      if (pointer.current) release(pointer.current.id, true);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    window.addEventListener("resize", cancel);
    document.addEventListener("visibilitychange", cancel);
    return () => {
      cancel();
      node.removeEventListener("wheel", wheel);
      window.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", cancel);
    };
  }, [prepare, move, release]);
  return <div ref={rail} className={styles.rail} data-shoe-rail role="group" aria-label={label} tabIndex={0}
    onPointerDown={event => {
      if (!event.isPrimary || event.button !== 0) return;
      prepare(); suppressClick.current = false;
      pointer.current = { id: event.pointerId, originX: event.clientX, originY: event.clientY, x: event.clientX, time: performance.now(), velocity: 0, dragged: false };
    }}
    onPointerMove={event => {
      const state = pointer.current;
      if (!state || state.id !== event.pointerId) return;
      const dx = event.clientX - state.originX;
      const dy = event.clientY - state.originY;
      if (!state.dragged) {
        if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx)) { pointer.current = null; return; }
        if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
        state.dragged = true; suppressClick.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.setAttribute("data-dragging", "true");
      }
      const now = performance.now();
      const delta = event.clientX - state.x;
      const elapsed = Math.max(1, now - state.time);
      state.velocity = state.velocity * .35 + delta / elapsed * .65;
      state.x = event.clientX; state.time = now;
      move(delta);
    }}
    onPointerUp={event => release(event.pointerId)}
    onPointerCancel={event => release(event.pointerId, true)}
    onLostPointerCapture={event => release(event.pointerId, true)}
    onClickCapture={event => { if (suppressClick.current && event.detail > 0) { event.preventDefault(); event.stopPropagation(); } }}
    onKeyDown={event => {
      if (event.target !== event.currentTarget || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      event.preventDefault(); prepare();
      const distance = event.key === "ArrowLeft" ? 180 : -180;
      if (reduced) move(distance); else glide(distance);
    }}>
    <div ref={track} className={styles.track} style={{ animationDuration: `${duration}s` }} data-shoe-track>{children}</div>
  </div>;
}
