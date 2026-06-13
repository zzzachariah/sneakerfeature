"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Sparkles } from "lucide-react";
import { ForYouView } from "@/components/personalize/for-you-view";
import type { ForYouData } from "@/lib/personalize/for-you-data";
import { useLocale } from "@/components/i18n/locale-provider";
import { haptics } from "@/lib/native/haptics";

// The home (`/`) leads with this For You landing layer over the slide deck. It
// auto-opens on the first visit of each day; the X dismisses it (revealing the
// browse experience underneath) and leaves a small "For You" pill to re-open.
// Per-user data is fetched lazily so the home page can stay statically cached.
const SEEN_KEY = "sf-foryou-seen";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

const EMPTY: ForYouData = {
  signedIn: false,
  username: "",
  personaPosition: null,
  digest: null,
  recentShoes: [],
  popular: []
};

export function ForYouOverlay() {
  const { translate } = useLocale();
  const [decided, setDecided] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [data, setData] = useState<ForYouData | null>(null);

  // Decide open/closed from the per-day "seen" marker (client-only).
  useEffect(() => {
    let seen: string | null = null;
    try {
      seen = window.localStorage.getItem(SEEN_KEY);
    } catch {
      /* ignore */
    }
    setExpanded(seen !== todayKey());
    setDecided(true);
  }, []);

  // Lazy-load the payload the first time we open.
  useEffect(() => {
    if (!expanded || data) return;
    let active = true;
    fetch("/api/personalize/foryou", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (active) setData(d as ForYouData);
      })
      .catch(() => {
        if (active) setData(EMPTY);
      });
    return () => {
      active = false;
    };
  }, [expanded, data]);

  function dismiss() {
    haptics.tap();
    try {
      window.localStorage.setItem(SEEN_KEY, todayKey());
    } catch {
      /* ignore */
    }
    setExpanded(false);
  }

  function reopen() {
    haptics.tap();
    setExpanded(true);
  }

  if (!decided) return null;

  return (
    <>
      <AnimatePresence>
        {expanded ? (
          <motion.div
            key="foryou-overlay"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            className="fixed left-0 right-0 z-30 bg-[rgb(var(--bg))]"
            style={{ top: "var(--top-nav-h, 64px)", bottom: "var(--mobile-nav-h, 0px)" }}
          >
            <button
              type="button"
              onClick={dismiss}
              aria-label={translate("Close")}
              className="absolute right-4 top-3 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.85)] text-[rgb(var(--text))] backdrop-blur transition hover:border-[rgb(var(--ring)/0.45)] active:scale-95"
            >
              <X className="h-4 w-4" />
            </button>

            <div data-home-scroll-container className="h-full overflow-y-auto overscroll-contain">
              {data ? (
                <ForYouView {...data} />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[rgb(var(--muted)/0.5)] border-t-[rgb(var(--accent))]" />
                </div>
              )}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!expanded ? (
        <motion.button
          type="button"
          onClick={reopen}
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          whileTap={{ scale: 0.96 }}
          aria-label={translate("For You")}
          className="fixed left-1/2 z-30 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-[rgb(var(--accent)/0.45)] bg-[rgb(var(--bg-elev)/0.9)] px-4 py-1.5 text-xs font-medium text-[rgb(var(--accent))] shadow-lg backdrop-blur"
          style={{ top: "calc(var(--top-nav-h, 64px) + 8px)" }}
        >
          <Sparkles className="h-3.5 w-3.5" /> {translate("For You")}
        </motion.button>
      ) : null}
    </>
  );
}
