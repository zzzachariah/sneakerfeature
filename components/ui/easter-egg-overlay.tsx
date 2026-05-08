"use client";

import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import {
  EASTER_EGG_COOLDOWN_MS,
  EASTER_EGG_DISPLAY_MS,
  appendTapTimestamp,
  advanceKeySequence,
  isExcludedTriggerTarget,
  type KeySequenceState
} from "@/lib/easter-egg-trigger";

const EASTER_EGG_IMAGE_SRC = "/lebron-sunshine.jpg";
const INITIAL_KEY_STATE: KeySequenceState = { count: 0, lastAt: 0 };

export function EasterEggOverlay() {
  const [visible, setVisible] = useState(false);
  const keyStateRef = useRef<KeySequenceState>(INITIAL_KEY_STATE);
  const tapQueueRef = useRef<number[]>([]);
  const hideTimeoutRef = useRef<number | null>(null);
  const cooldownTimeoutRef = useRef<number | null>(null);
  const coolingDownRef = useRef(false);

  useEffect(() => {
    function clearTimers() {
      if (hideTimeoutRef.current !== null) {
        window.clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      if (cooldownTimeoutRef.current !== null) {
        window.clearTimeout(cooldownTimeoutRef.current);
        cooldownTimeoutRef.current = null;
      }
    }

    function resetSequences() {
      keyStateRef.current = INITIAL_KEY_STATE;
      tapQueueRef.current = [];
    }

    function triggerEasterEgg() {
      if (coolingDownRef.current) return;

      coolingDownRef.current = true;
      resetSequences();
      clearTimers();
      setVisible(true);

      hideTimeoutRef.current = window.setTimeout(() => {
        setVisible(false);
      }, EASTER_EGG_DISPLAY_MS);

      cooldownTimeoutRef.current = window.setTimeout(() => {
        coolingDownRef.current = false;
      }, EASTER_EGG_COOLDOWN_MS);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || coolingDownRef.current) return;
      if (isExcludedTriggerTarget(event.target)) return;

      const nextState = advanceKeySequence(keyStateRef.current, event.key, Date.now());
      keyStateRef.current = nextState;

      if (nextState.count >= 3) {
        triggerEasterEgg();
      }
    }

    function registerTouchTrigger(target: EventTarget | null) {
      if (coolingDownRef.current) return;
      if (isExcludedTriggerTarget(target)) return;

      const nextQueue = appendTapTimestamp(tapQueueRef.current, Date.now());
      tapQueueRef.current = nextQueue;

      if (nextQueue.length >= 3) {
        triggerEasterEgg();
      }
    }

    function onPointerDown(event: PointerEvent) {
      if (event.pointerType !== "touch") return;
      registerTouchTrigger(event.target);
    }

    function onTouchEnd(event: TouchEvent) {
      if ("PointerEvent" in window) return;
      registerTouchTrigger(event.target);
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("touchend", onTouchEnd);
      clearTimers();
    };
  }, []);

  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-[120] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.08, ease: "easeOut" }}
        >
          <Image
            src={EASTER_EGG_IMAGE_SRC}
            alt=""
            fill
            sizes="100vw"
            priority
            className="object-cover"
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
