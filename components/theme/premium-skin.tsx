"use client";

// Menu-bar "Premium UI" switcher. Lets ANYONE flip the whole site into one of the
// four luxury skin design languages (Sapphire / Aurora / Obsidian / Champion) or
// back to the standard look — a purely visual, site-wide skin, independent of
// membership entitlements. The chosen skin is stamped as `data-premium="<skin>"`
// on <html> and styled entirely from globals.css (accent, ground temperature,
// shoe stage, card hairlines, ambient wash), so it themes every page at once and
// works in both light and dark.
//
// Two pieces, mirroring ThemeToggle / SkinInitScript:
//   • PremiumSkinInitScript — a blocking inline <script> that applies the stored
//     skin BEFORE first paint so there's no flash.
//   • PremiumSkinToggle (desktop popover) + PremiumSkinOptions (inline list for
//     the mobile menu) — the interactive pickers.
//
// Coordination: when a premium skin is active, MemberThemeApplier defers its
// inline --brand override (it watches data-premium) so the skin's stylesheet
// accent wins; turning premium off restores the member's own accent.

import { useEffect, useRef, useState } from "react";
import { Gem, Check } from "lucide-react";
import { SKIN_ORDER, SKINS, isSkinId, type SkinId } from "@/lib/subscription/skins";
import { useLocale } from "@/components/i18n/locale-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const PREMIUM_UI_KEY = "sf-premium-ui";

export function applyPremiumSkin(skin: SkinId | null) {
  const root = document.documentElement;
  try {
    if (skin) {
      root.setAttribute("data-premium", skin);
      window.localStorage.setItem(PREMIUM_UI_KEY, skin);
    } else {
      root.removeAttribute("data-premium");
      window.localStorage.removeItem(PREMIUM_UI_KEY);
    }
  } catch {
    // storage blocked — the attribute still applies for this session
    if (skin) root.setAttribute("data-premium", skin);
    else root.removeAttribute("data-premium");
  }
}

export function readPremiumSkin(): SkinId | null {
  try {
    const v = window.localStorage.getItem(PREMIUM_UI_KEY);
    return isSkinId(v) ? v : null;
  } catch {
    return null;
  }
}

// Pre-paint: apply the stored premium skin before React hydrates so a returning
// user never flashes the default look. The empty catch keeps the site from ever
// ending up unstyled if storage throws.
export function PremiumSkinInitScript({ nonce }: { nonce?: string }) {
  const code = `(() => { try { var v = localStorage.getItem('${PREMIUM_UI_KEY}'); if (v === 'sapphire' || v === 'aurora' || v === 'obsidian' || v === 'champion') document.documentElement.setAttribute('data-premium', v); } catch (e) {} })();`;
  return <script nonce={nonce} dangerouslySetInnerHTML={{ __html: code }} />;
}

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
 * popover and directly in the mobile hamburger menu. Calls onPick after applying.
 */
export function PremiumSkinOptions({ active, onPick }: { active: SkinId | null; onPick?: (skin: SkinId | null) => void }) {
  const { locale } = useLocale();
  const zh = locale === "zh";

  const choose = (skin: SkinId | null) => {
    applyPremiumSkin(skin);
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
  const [active, setActive] = useState<SkinId | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActive(readPremiumSkin());
  }, []);

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
          <PremiumSkinOptions
            active={active}
            onPick={(skin) => {
              setActive(skin);
              setOpen(false);
            }}
          />
          <p className="px-3 pb-1 pt-1.5 text-[0.68rem] leading-snug text-[rgb(var(--subtext))]">
            {zh ? "整站换肤，浅色/深色都适配。" : "Skins the whole site, in light & dark."}
          </p>
        </div>
      )}
    </div>
  );
}
