"use client";

import React, { useState } from "react";
import { ChevronsUp, GitCompare, Heart, SlidersHorizontal, X } from "lucide-react";

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
import { useLocale } from "@/components/i18n/locale-provider";

type Props = {
  visible: boolean;
  compareMode: boolean;
  onlyFavorites: boolean;
  onCollapse: () => void;
  onToggleCompare: () => void;
  onToggleFavorites: () => void;
};

// Speed-dial floating control for the expanded database feed: tap the main
// button to fan out Collapse / Compare / Saved-only. Reuses the .glass material
// so it's real Liquid Glass in the iOS app and a solid pill under the clean skin.
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
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);
  // Top-to-bottom render order; they fan upward from the main button.
  const actions = [
    {
      key: "fav",
      label: translate("Saved only"),
      icon: Heart,
      active: onlyFavorites,
      onClick: () => {
        onToggleFavorites();
        close();
      }
    },
    {
      key: "cmp",
      label: translate("Compare"),
      icon: GitCompare,
      active: compareMode,
      onClick: () => {
        onToggleCompare();
        close();
      }
    },
    {
      key: "col",
      label: translate("Collapse"),
      icon: ChevronsUp,
      active: false,
      onClick: () => {
        onCollapse();
        close();
      }
    }
  ];

  const anyActive = compareMode || onlyFavorites;

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
          style={{
            opacity: open ? 1 : 0,
            transform: open || reduce ? "none" : "translateY(10px) scale(0.9)",
            pointerEvents: open ? "auto" : "none",
            transition: reduce
              ? "opacity 0.01s"
              : `opacity 200ms var(--ease) ${open ? i * 45 : 0}ms, transform 200ms var(--ease) ${open ? i * 45 : 0}ms`
          }}
        >
          <span className="glass glass-clip rounded-full px-2.5 py-1 text-[0.72rem] font-medium">{a.label}</span>
          <button
            type="button"
            onClick={a.onClick}
            aria-label={a.label}
            aria-pressed={a.active}
            className={`glass glass-rim relative inline-flex h-11 w-11 items-center justify-center rounded-full transition active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand)/0.55)] ${
              a.active ? "bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--brand))] ring-2 ring-[rgb(var(--brand)/0.5)] ring-inset" : "text-[rgb(var(--text))]"
            }`}
          >
            <a.icon className="h-5 w-5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={translate("Feed controls")}
        className="glass glass-rim glass-clip glass-interactive relative inline-flex h-[52px] w-[52px] items-center justify-center rounded-full text-[rgb(var(--text))] transition active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--brand)/0.55)]"
      >
        {open ? <X className="h-5 w-5" /> : <SlidersHorizontal className="h-5 w-5" />}
        {anyActive && !open && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[rgb(var(--brand))] ring-2 ring-[rgb(var(--bg))]" />
        )}
      </button>
    </div>
  );
}
