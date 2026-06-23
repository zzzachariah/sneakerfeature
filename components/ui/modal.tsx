"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "@/components/i18n/locale-provider";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  zIndexClass = "z-50",
  maxWidthClass = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  dismissible?: boolean;
  zIndexClass?: string;
  /** Tailwind max-width class for the dialog. Defaults to `max-w-lg`; larger
   * editors (bilingual forms, etc.) can opt into `max-w-2xl` / `max-w-3xl`. */
  maxWidthClass?: string;
}) {
  const { translate } = useLocale();
  useBodyScrollLock(open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-[rgb(var(--glass-overlay)/0.4)] backdrop-blur-[16px]`}
          // Reserve the full top nav bar and bottom tab bar footprints (not just
          // the raw safe-area insets) so the dialog never sits under the top nav
          // or the bottom tab bar — native chrome in the app, web nav on mobile.
          // --top-nav-h already folds in --safe-top; --mobile-nav-h folds in
          // --safe-bottom and collapses to 0 on desktop (no bottom nav there).
          style={{
            padding: "max(1rem, var(--top-nav-h)) 1rem max(1rem, var(--mobile-nav-h))"
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (dismissible) onClose();
          }}
          // Slide-deck pages (home, shoe detail) attach wheel/swipe/key handlers
          // to window to flip slides. Stop those events here so scrolling inside
          // the modal scrolls the modal — not the deck behind it.
          onWheel={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <motion.div
            className={`glass-strong glass-rim glass-clip liquid-interactive relative flex max-h-full w-full ${maxWidthClass} flex-col rounded-3xl`}
            initial={{ y: 16, opacity: 0, scale: 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 8, opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
          >
            {title ? (
              <h2 className="shrink-0 border-b border-[rgb(var(--glass-stroke-soft)/0.4)] px-6 pt-6 pb-4 text-lg font-semibold tracking-[0.01em]">
                {translate(title)}
              </h2>
            ) : null}
            <div className={`min-h-0 flex-1 overflow-y-auto px-6 pb-6 ${title ? "pt-4" : "pt-6"}`}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
