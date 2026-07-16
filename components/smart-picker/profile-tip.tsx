"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Lightbulb, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePersona } from "@/components/preferences/persona-provider";
import { haptics } from "@/lib/native/haptics";
import { DUR, EASE, SPRING, SPRING_POP } from "@/lib/motion/constants";

// Remembers the user's choice so a collapsed tip stays a small pill on the next
// visit instead of popping back open. "1" = collapsed.
const STORAGE_KEY = "sp-profile-tip-collapsed";

/**
 * A small, self-contained hint shown on the Smart Picker empty state: tell the
 * user that a saved player profile means they don't have to repeat their
 * height/weight, and that richer detail yields more trustworthy picks. Tapping
 * the card collapses it into a compact "Tip" pill (state persisted); tapping the
 * pill brings it back. Fully animated, reduced-motion aware, and sized to work
 * on desktop web, mobile web, and the native client alike.
 */
export function ProfileTip() {
  const { translate } = useLocale();
  const { persona, openModal } = usePersona();
  const reduce = useReducedMotion();

  // Gate on mount so the persisted preference is applied without a hydration
  // mismatch (server render + first client render both produce nothing).
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* storage blocked (private mode) — default to expanded */
    }
  }, []);

  const persist = (next: boolean) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  const collapse = () => {
    haptics.selection();
    setCollapsed(true);
    persist(true);
  };
  const expand = () => {
    haptics.selection();
    setCollapsed(false);
    persist(false);
  };

  if (!mounted) return null;

  const profileSet = Boolean(persona);
  const actionLabel = profileSet ? translate("Edit profile") : translate("Set up profile");

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.slow, ease: EASE }}
      className="mx-auto mt-6 flex w-full max-w-md justify-center"
    >
      <AnimatePresence mode="wait" initial={false}>
        {collapsed ? (
          <motion.button
            key="pill"
            type="button"
            onClick={expand}
            aria-label={translate("Show tip")}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
            transition={reduce ? { duration: DUR.base } : SPRING_POP}
            className="tap-44 inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.6)] px-3.5 py-1.5 text-[0.76rem] font-medium soft-text transition hover:border-[rgb(var(--brand)/0.5)] hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)]"
          >
            <Lightbulb className="h-3.5 w-3.5 text-[rgb(var(--brand))]" />
            {translate("Tip")}
          </motion.button>
        ) : (
          <motion.div
            key="card"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
            transition={reduce ? { duration: DUR.base } : SPRING}
            className="relative w-full overflow-hidden rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-4 py-3.5 text-left shadow-[0_10px_30px_-18px_rgb(var(--shadow)/0.5)] backdrop-blur-sm"
          >
            {/* Soft brand glow — a touch of flair without shouting. */}
            <span
              aria-hidden
              className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[rgb(var(--brand)/0.16)] blur-2xl"
            />

            <button
              type="button"
              onClick={collapse}
              aria-label={translate("Hide tip")}
              className="tap-44 absolute right-1.5 top-1.5 z-10 grid h-7 w-7 place-items-center rounded-full text-[rgb(var(--text)/0.55)] transition hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="relative flex items-start gap-3 pr-6">
              <motion.span
                aria-hidden
                initial={false}
                animate={reduce ? undefined : { scale: [1, 1.08, 1] }}
                transition={reduce ? undefined : { duration: 2.4, ease: "easeInOut", repeat: Infinity }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--brand)/0.14)] text-[rgb(var(--brand))]"
              >
                <Lightbulb className="h-[1.05rem] w-[1.05rem]" />
              </motion.span>

              <div className="min-w-0">
                <p className="text-[0.82rem] font-semibold tracking-[-0.01em]">
                  {translate("Get sharper picks")}
                </p>
                <p className="mt-1 text-[0.8rem] leading-relaxed soft-text">
                  {translate(
                    "With a player profile set, there's no need to re-enter your height and weight — just name the tech you want or what matters most to you. The more detail you share, the more trustworthy the picks."
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    haptics.selection();
                    openModal();
                  }}
                  className="tap-44 mt-2 inline-flex items-center gap-1 text-[0.78rem] font-semibold text-[rgb(var(--brand))] transition hover:gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)]"
                >
                  {actionLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
