"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useLocale } from "@/components/i18n/locale-provider";

export function Modal({
  open,
  onClose,
  title,
  children,
  dismissible = true,
  zIndexClass = "z-50",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  dismissible?: boolean;
  zIndexClass?: string;
}) {
  const { translate } = useLocale();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${zIndexClass} flex items-center justify-center bg-[rgb(var(--glass-overlay)/0.5)] p-4`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (dismissible) onClose();
          }}
        >
          <motion.div
            className="surface-card liquid-interactive premium-border flex max-h-[85vh] w-full max-w-lg flex-col rounded-3xl shadow-[0_30px_72px_rgb(var(--glass-shadow)/0.42)]"
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
