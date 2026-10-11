"use client";

import { useEffect, useRef, type RefObject } from "react";

const dialogStack: HTMLElement[] = [];

/** Keep keyboard focus in the top dialog and return it to its trigger on close. */
export function useDialogAccessibility(dialogRef: RefObject<HTMLElement | null>, open: boolean, onClose: () => void, dismissible = true) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogStack.push(dialog);
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(el => el.getClientRects().length > 0 && !el.closest('[hidden],[inert]'));
    const frame = requestAnimationFrame(() => (focusable()[0] ?? dialog).focus());
    const onKey = (e: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialog) return;
      if (e.key === "Escape" && dismissible) { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const elements = focusable();
      const first = elements[0] ?? dialog;
      const last = elements.at(-1) ?? dialog;
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog || (e.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        e.preventDefault(); (e.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey, true);
      const index = dialogStack.indexOf(dialog);
      if (index >= 0) dialogStack.splice(index, 1);
      if (previous?.isConnected) previous.focus();
    };
  }, [open, dismissible, dialogRef]);
}
