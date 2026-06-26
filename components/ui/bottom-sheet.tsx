"use client";

import { useEffect, useId } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useLocale } from "@/components/i18n/locale-provider";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";
import { haptics } from "@/lib/native/haptics";
import { SPRING_SOFT } from "@/lib/motion/constants";

// A draggable bottom sheet — the native-feeling counterpart to <Modal>. Slides up
// from the bottom edge, can be flicked/dragged down to dismiss, and dims + blurs
// the page behind it. Used for filters, share, and report on web/Android (iOS gets
// real native action sheets elsewhere). Shares the Liquid Glass material + the
// safe-area + nav-footprint padding logic with <Modal> so it sits correctly under
// the native/web chrome.
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  zIndexClass = "z-50",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  dismissible?: boolean;
  zIndexClass?: string;
}) {
  const { translate } = useLocale();
  const reduce = useReducedMotion();
  const titleId = useId();
  useBodyScrollLock(open);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          // Inset by the top navbar and mobile bottom nav so the sheet (and its
          // dim backdrop) sit BETWEEN the chrome — never covering it. The top
          // navbar (z-40) and mobile bottom nav (z-40) stay visible above the
          // dim. The sheet itself is dragged from the bottom of this inset box.
          className={`fixed left-0 right-0 ${zIndexClass} flex items-end justify-center bg-[rgb(var(--glass-overlay)/0.45)] backdrop-blur-[12px] sm:items-center`}
          style={{ top: "var(--top-nav-h)", bottom: "var(--mobile-nav-h)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => dismissible && onClose()}
          // Stop slide-deck pages (home, detail) from paging while the sheet scrolls.
          onWheel={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <motion.div
            role="dialog"
            aria-modal
            aria-labelledby={title ? titleId : undefined}
            // max-h-full so the sheet fills its inset container (already sized
            // to sit between the navs) without spilling under them.
            className="glass-strong glass-rim glass-clip liquid-interactive relative flex max-h-full w-full max-w-lg flex-col rounded-t-[28px] sm:max-h-[80dvh] sm:rounded-3xl"
            style={{ paddingBottom: "max(0.75rem, var(--safe-bottom))" }}
            initial={{ y: reduce ? 0 : "100%" }}
            animate={{ y: 0 }}
            exit={{ y: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }}
            transition={reduce ? { duration: 0.16 } : SPRING_SOFT}
            drag={dismissible && !reduce ? "y" : false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (!dismissible) return;
              if (info.offset.y > 120 || info.velocity.y > 700) {
                haptics.gesture();
                onClose();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Grabber handle — the universal "drag me down" affordance. */}
            <div className="flex shrink-0 cursor-grab justify-center pt-3 active:cursor-grabbing">
              <span aria-hidden className="h-1.5 w-10 rounded-full bg-[rgb(var(--text)/0.18)]" />
            </div>
            {title ? (
              <h2 id={titleId} className="shrink-0 px-6 pb-3 pt-2 text-lg font-semibold tracking-[0.01em]">
                {translate(title)}
              </h2>
            ) : null}
            <div className={`min-h-0 flex-1 overflow-y-auto px-6 ${title ? "" : "pt-2"} pb-2`}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
