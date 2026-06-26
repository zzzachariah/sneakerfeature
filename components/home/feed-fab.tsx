"use client";

import React from "react";
import { ChevronsUp, GitCompare, Heart } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

type Props = {
  visible: boolean;
  compareMode: boolean;
  onlyFavorites: boolean;
  onCollapse: () => void;
  onToggleCompare: () => void;
  onToggleFavorites: () => void;
};

function useReducedMotion() {
  const [r, setR] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(mq.matches);
    const h = (e: MediaQueryListEvent) => setR(e.matches);
    mq.addEventListener("change", h);
    return () => mq.removeEventListener("change", h);
  }, []);
  return r;
}

// Floating action cluster for the expanded database feed. Always shows all
// three actions when visible — no click-to-expand. Becomes visible when the
// shoe grid enters the viewport and hides when the user scrolls above it.
// Reuses the .glass material so it's real Liquid Glass in the iOS app.
export function FeedFab({
  visible,
  compareMode,
  onlyFavorites,
  onCollapse,
  onToggleCompare,
  onToggleFavorites
}: Props) {
  const { translate } = useLocale();
  const reduce = useReducedMotion();

  const actions = [
    {
      key: "fav",
      label: translate("Saved only"),
      icon: Heart,
      active: onlyFavorites,
      onClick: onToggleFavorites
    },
    {
      key: "cmp",
      label: translate("Compare"),
      icon: GitCompare,
      active: compareMode,
      onClick: onToggleCompare
    },
    {
      key: "col",
      label: translate("Collapse"),
      icon: ChevronsUp,
      active: false,
      onClick: onCollapse
    }
  ];

  return (
    <div
      className="fixed right-[var(--container-gutter)] z-40 flex flex-col items-end gap-2.5"
      style={{
        bottom: "calc(var(--mobile-nav-h, 0px) + 20px)",
        opacity: visible ? 1 : 0,
        transform: visible || reduce ? "none" : "translateY(12px)",
        pointerEvents: visible ? "auto" : "none",
        transition: reduce ? "opacity 0.01s" : "opacity 240ms var(--ease), transform 240ms var(--ease)"
      }}
    >
      {actions.map((a, i) => (
        <div
          key={a.key}
          className="flex items-center gap-2"
          style={
            reduce
              ? undefined
              : {
                  transitionDelay: visible ? `${i * 40}ms` : "0ms",
                  opacity: visible ? 1 : 0,
                  transform: visible ? "none" : "translateY(8px) scale(0.92)",
                  transition: "opacity 200ms var(--ease), transform 200ms var(--ease)"
                }
          }
        >
          <span className="glass glass-clip rounded-full px-2.5 py-1 text-[0.72rem] font-medium ios-glass-fab-label">
            {a.label}
          </span>
          <button
            type="button"
            onClick={a.onClick}
            aria-label={a.label}
            aria-pressed={a.active}
            className={`glass glass-rim ios-glass-fab relative inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand)/0.55)] ${
              a.active
                ? "bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--brand))] ring-2 ring-[rgb(var(--brand)/0.5)] ring-inset"
                : "text-[rgb(var(--text))]"
            }`}
          >
            <a.icon className="h-5 w-5" />
          </button>
        </div>
      ))}
    </div>
  );
}
