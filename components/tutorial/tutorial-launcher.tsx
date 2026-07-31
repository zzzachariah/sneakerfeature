"use client";

import { useEffect, useState } from "react";
import { HelpCircle, X } from "lucide-react";
import { useTutorial } from "@/components/tutorial/tutorial-provider";
import { useLocale } from "@/components/i18n/locale-provider";

/**
 * Opt-in entry point for the onboarding tour: a small pill that sits out of the
 * way in the bottom-left corner instead of the tour hijacking a first visit.
 * Tapping it starts the tour; the X dismisses the invitation for good (both are
 * persisted by the provider). The "Site tour" menu entry still reopens the tour
 * afterwards.
 */
export function TutorialLauncher() {
  const { active, launcherVisible, start, dismissLauncher } = useTutorial();
  const { translate } = useLocale();
  const [shown, setShown] = useState(false);

  // Small delay so the pill fades in after the page has settled rather than
  // competing with the first paint.
  useEffect(() => {
    if (!launcherVisible || active) {
      setShown(false);
      return;
    }
    const t = window.setTimeout(() => setShown(true), 900);
    return () => window.clearTimeout(t);
  }, [launcherVisible, active]);

  if (!launcherVisible || active) return null;

  return (
    <div
      className="glass glass-rim fixed left-3 z-[45] flex items-center gap-1 rounded-full py-1 pl-1 pr-1 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
      style={{
        bottom: "calc(var(--mobile-nav-h) + 14px)",
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(8px)",
        pointerEvents: shown ? "auto" : "none"
      }}
    >
      <button
        type="button"
        onClick={() => start()}
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.78rem] font-medium text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.08)]"
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0" />
        {translate("New here? Take the tour")}
      </button>
      <button
        type="button"
        onClick={dismissLauncher}
        aria-label={translate("Dismiss tour invitation")}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[rgb(var(--subtext))] transition hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
