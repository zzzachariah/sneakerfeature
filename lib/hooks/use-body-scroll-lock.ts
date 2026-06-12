"use client";

import { useEffect } from "react";

// Module-level reference count so nested locks (e.g. a dialog opened on top of
// a slide deck that already locked scrolling) compose correctly: the first
// lock saves + applies, and only the last unlock restores. This fixes the
// previous per-component implementations that could restore `overflow` while
// another consumer still needed it locked.
let lockCount = 0;
let savedOverflow = "";

/**
 * Locks `document.body` scrolling while `active` is true. Safe to use from
 * many components at once (modals, dialogs, full-screen slide decks).
 */
export function useBodyScrollLock(active: boolean = true) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = savedOverflow;
      }
    };
  }, [active]);
}
