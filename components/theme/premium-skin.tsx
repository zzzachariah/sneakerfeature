"use client";

// Menu-bar "Premium UI" switcher. Lets ANYONE flip the whole site into one of the
// four luxury design languages (Sapphire / Aurora / Obsidian / Champion) or back
// to the standard look. A skin is a site-wide identity: it re-colors + re-fonts
// every page from globals.css / premium-skins.css (via data-premium on <html>)
// AND — through PremiumSkinProvider — lets each page render a different STRUCTURE
// (see components/premium/*). Independent of membership entitlements.
//
// State lives in PremiumSkinProvider (components/theme/premium-skin-context.tsx),
// which owns the attribute + localStorage + cookie and seeds itself from the
// server value. This file is just the two pickers:
//   • PremiumSkinToggle — the desktop popover.
//   • PremiumSkinOptions — the inline list reused inside the mobile menu.
// The pre-paint init (PremiumSkinInitScript) also lives in the context module.
//
// Coordination: when a premium skin is active, MemberThemeApplier defers its
// inline --brand override (it watches data-premium) so the skin's stylesheet
// accent wins; turning premium off restores the member's own accent.

import { useEffect, useRef, useState } from "react";
import { Gem, Check } from "lucide-react";
import { SKIN_ORDER, SKINS, type SkinId } from "@/lib/subscription/skins";
import { usePremiumSkin } from "@/components/theme/premium-skin-context";
import { useLocale } from "@/components/i18n/locale-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Re-exported for the handful of call sites that still import these names from
// here; the implementations now live in the context module.
export { PREMIUM_UI_KEY, applyPremiumSkin, readPremiumSkin, PremiumSkinInitScript } from "@/components/theme/premium-skin-context";

function skinLabel(id: SkinId, zh: boolean) {
  return zh ? SKINS[id].name : SKINS[id].nameEn;
}

// A duotone color chip for a skin — its Pro→Max accent pair, so each skin reads
// as a distinct swatch (Sapphire blue→gold, Aurora cyan→purple, Obsidian
// platinum→indigo, Champion gold) and matches the accent it actually applies.
function Swatch({ id }: { id: SkinId }) {
  const s = SKINS[id];
  return (
    <span
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 rounded-full"
      style={{
        background: `linear-gradient(135deg, ${s.pro.accent} 0%, ${s.max.accent} 100%)`,
        boxShadow: "inset 0 0 0 1px rgb(var(--text) / 0.15)",
      }}
    />
  );
}

/**
 * Inline option list (Off + the four skins). Used both inside the desktop
 * popover and directly in the mobile hamburger menu. Drives the shared skin
 * context, so every consumer (navbar dot, page structure) updates at once.
 */
export function PremiumSkinOptions({ onPick }: { onPick?: (skin: SkinId | null) => void }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const { skin: active, setSkin } = usePremiumSkin();

  const choose = (skin: SkinId | null) => {
    setSkin(skin);
    onPick?.(skin);
  };

  return (
    <>
      <button
        type="button"
        role="menuitemradio"
        aria-checked={active === null}
        onClick={() => choose(null)}
        className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border border-[rgb(var(--muted))]" />
          {zh ? "标准（关闭）" : "Standard (off)"}
        </span>
        {active === null ? <Check className="h-4 w-4" /> : null}
      </button>
      {SKIN_ORDER.map((id) => (
        <button
          key={id}
          type="button"
          role="menuitemradio"
          aria-checked={active === id}
          onClick={() => choose(id)}
          className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]"
        >
          <span className="flex items-center gap-2.5">
            <Swatch id={id} />
            {skinLabel(id, zh)}
          </span>
          {active === id ? <Check className="h-4 w-4" /> : null}
        </button>
      ))}
    </>
  );
}

export function PremiumSkinToggle({ className }: { className?: string }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const [open, setOpen] = useState(false);
  const { skin: active } = usePremiumSkin();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const label = zh ? "质感" : "Premium UI";

  return (
    <div ref={wrapRef} className="relative">
      <Tooltip label={label}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--subtext))] transition-[background-color,color,transform] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] md:h-8 md:w-8",
            active ? "text-[rgb(var(--brand))]" : "",
            className
          )}
        >
          <Gem className="h-[18px] w-[18px] md:h-[14px] md:w-[14px]" />
          {active ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[rgb(var(--brand))] ring-2 ring-[rgb(var(--bg))]"
            />
          ) : null}
        </button>
      </Tooltip>
      {open && (
        <div
          className="nav-dropdown-panel nav-pop absolute right-0 top-[calc(100%+0.4rem)] z-50 w-[15rem] rounded-xl p-1.5"
          role="menu"
        >
          <div className="px-3 pb-1 pt-1 text-[0.7rem] font-medium uppercase tracking-wide text-[rgb(var(--subtext))]">
            {zh ? "整站质感" : "Premium UI skin"}
          </div>
          <PremiumSkinOptions onPick={() => setOpen(false)} />
          <p className="px-3 pb-1 pt-1.5 text-[0.68rem] leading-snug text-[rgb(var(--subtext))]">
            {zh ? "整站换肤 · 重排版式，浅色/深色都适配。" : "Re-skins & re-lays-out the whole site, light & dark."}
          </p>
        </div>
      )}
    </div>
  );
}
