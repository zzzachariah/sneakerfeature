"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";
import { DUR, EASE } from "@/lib/motion/constants";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function AboutModal({ open, onClose }: Props) {
  const { translate } = useLocale();
  const reduce = useReducedMotion();

  useBodyScrollLock(open);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-[rgb(var(--glass-overlay)/0.72)] p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0 : DUR.base, ease: EASE }}
          onClick={onClose}
        >
          <motion.div
            className="glass-strong glass-rim glass-clip liquid-interactive relative w-full max-w-2xl rounded-3xl p-5 md:p-6"
            initial={{ y: reduce ? 0 : 18, opacity: 0, scale: reduce ? 1 : 0.985 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: reduce ? 0 : 8, opacity: 0, scale: reduce ? 1 : 0.985 }}
            transition={{ duration: reduce ? 0 : DUR.slow, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
        <button
          type="button"
          aria-label={translate("Close information modal")}
          className="absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-md text-[rgb(var(--subtext))] transition hover:bg-[rgb(var(--muted)/0.28)] hover:text-[rgb(var(--text))]"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </button>
        <div className="pr-10">
          <h3 className="text-xl font-semibold tracking-[0.015em]">{translate("Hi!")}</h3>
          <p className="mt-1 text-[0.78rem] soft-text">{translate("Some words")}</p>
        </div>
        <div className="mt-4 max-h-[55vh] space-y-3 overflow-y-auto pr-1 text-[0.85rem] leading-[1.55] soft-text">
          <p>
            The idea of a platform with information on sneakers has been with me for a year. Back then, AI coding was not yet a well-developed field. Therefore, since I know absolutely nothing about coding (a bit now, I suppose), I quit. The development of technology enabled me to turn the initial idea into reality.
          </p>
          <p>
            I always spend tons of time choosing which sneaker to purchase. YouTube channels and blogs tend to have biased opinions on a shoe. Moreover, the technologies each brand presents vary in their names, function, and appeal to players. sneakerfeature is designed to show unbiased information in the hope of saving you some time when deciding which shoe to purchase, and to make a purchase that fits best with your preference and taste.
          </p>
          <p>
            As a high school student, I am new to both building a website from scratch and maintaining a community. If you have any advice or would like to join as an admin (review shoe uploads) or developer, please feel free to go to the bottom of any page and press &quot;contact&quot;. At the same time, please do not attack or post offensive comments that attack others(you can say a sneaker is shit, though)
          </p>
          <p>
            By the way, if this turned out to be liked by many, perhaps I will charge a one-time fee of a dollar per account in order to cover the fees of databases and domains, etc. I hate ads myself, so there will maybe be 1 or 2, but definitely not scattered around the page. I&apos;ll decide it later.
          </p>
          <p>{translate("In the meantime, enjoy!")}</p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
