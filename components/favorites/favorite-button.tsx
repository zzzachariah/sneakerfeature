"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { Heart } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";
import { EASE } from "@/lib/motion/constants";

// Heart toggle. Signed-out users are sent to log in (returning here). Works
// inside a card <Link> — it stops propagation so it never triggers navigation.
// Saving plays a celebratory pop + a radiating ring and a success haptic;
// un-saving is a quiet tap. All flourishes disable under reduced-motion.
export function FavoriteButton({
  shoeId,
  className = "",
  iconClassName = "h-4 w-4",
  showLabel = false
}: {
  shoeId: string;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
}) {
  const { isFavorite, toggle } = useFavorites();
  const { signedIn } = useAuthState();
  const router = useRouter();
  const pathname = usePathname();
  const { translate } = useLocale();
  const reduce = useReducedMotion();
  const fav = isFavorite(shoeId);

  // Fire the burst only on a not-saved → saved transition (not on mount / unsave).
  const [burst, setBurst] = useState(0);
  const prevFav = useRef(fav);
  useEffect(() => {
    if (fav && !prevFav.current && !reduce) setBurst((b) => b + 1);
    prevFav.current = fav;
  }, [fav, reduce]);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!signedIn) {
          router.push(`/login?next=${encodeURIComponent(pathname)}` as Route);
          return;
        }
        if (!fav) haptics.success();
        else haptics.tap();
        void toggle(shoeId);
      }}
      aria-pressed={fav}
      aria-label={translate(fav ? "Saved" : "Save")}
      className={`inline-flex items-center justify-center gap-1.5 transition active:scale-90 ${className}`}
    >
      <span className="relative inline-flex items-center justify-center">
        <AnimatePresence>
          {burst > 0 && !reduce ? (
            <motion.span
              key={burst}
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-full border border-[rgb(var(--brand))]"
              initial={{ scale: 0.5, opacity: 0.65 }}
              animate={{ scale: 2.4, opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          ) : null}
        </AnimatePresence>
        <motion.span
          key={burst}
          className="inline-flex"
          animate={burst > 0 ? { scale: [1, 1.4, 1] } : { scale: 1 }}
          transition={{ duration: 0.42, ease: EASE, times: [0, 0.4, 1] }}
        >
          <Heart
            className={`${iconClassName} ${fav ? "fill-[rgb(var(--brand))] text-[rgb(var(--brand))]" : "text-[rgb(var(--text)/0.7)]"}`}
          />
        </motion.span>
      </span>
      {showLabel ? <span>{translate(fav ? "Saved" : "Save")}</span> : null}
    </button>
  );
}
