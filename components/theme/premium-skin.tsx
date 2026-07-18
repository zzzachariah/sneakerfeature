"use client";

// Menu-bar "Premium UI" switcher. Flips the whole site into one of the four
// luxury design languages (Sapphire / Aurora / Obsidian / Champion) or back to
// the standard look. A skin is a site-wide identity: it re-colors + re-fonts
// every page from globals.css / premium-skins.css (via data-premium on <html>)
// AND — through PremiumSkinProvider — lets each page render a different STRUCTURE
// (see components/premium/*).
//
// Skins are a PAID membership perk: the picker gates each option by tier exactly
// like the subscribe page (paid gets the set; the Max-exclusive Champion needs
// Max), and PremiumSkinGuard revokes a skin the current tier isn't entitled to.
//
// State lives in PremiumSkinProvider (components/theme/premium-skin-context.tsx),
// which owns the attribute + localStorage + cookie and seeds itself from the
// server value. This file is the entitlement layer + the two pickers:
//   • PremiumSkinToggle — the desktop popover.
//   • PremiumSkinOptions — the inline list reused inside the mobile menu.
// The pre-paint init (PremiumSkinInitScript) also lives in the context module.
//
// Coordination: when a premium skin is active, MemberThemeApplier defers its
// inline --brand override (it watches data-premium) so the skin's stylesheet
// accent wins; turning premium off restores the member's own accent.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Gem, Check, Lock } from "lucide-react";
import { SKIN_ORDER, SKINS, isMaxExclusiveSkin, type SkinId } from "@/lib/subscription/skins";
import { isPaidTier, type Tier } from "@/lib/subscription/tiers";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { usePremiumSkin } from "@/components/theme/premium-skin-context";
import { useLocale } from "@/components/i18n/locale-provider";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Re-exported for the handful of call sites that still import these names from
// here; the implementations now live in the context module.
export { PREMIUM_UI_KEY, applyPremiumSkin, readPremiumSkin, PremiumSkinInitScript } from "@/components/theme/premium-skin-context";

// Entitlement — mirrors the membership skin picker exactly (see subscribe-client
// `canPersonalize` / `canSignature`): skins are a PAID perk, so free / signed-out
// get none; the Max-exclusive skin (Champion) needs Max. `tier` already resolves
// admins to "max" (AuthStateProvider), so admins are covered with no extra case.
export function skinAllowed(id: SkinId, tier: Tier): boolean {
  if (!isPaidTier(tier)) return false;
  if (isMaxExclusiveSkin(id)) return tier === "max";
  return true;
}

// Revoke a premium skin the current tier isn't entitled to. The pre-paint init
// applies the last-stored skin before the tier is known (a member who lapsed to
// free, a Pro holding the Max-only Champion, or a stale value), so once auth
// resolves we clear anything no longer allowed — through the context setter so
// the page STRUCTURE reverts in lockstep with the CSS attribute. Mount once
// under AuthStateProvider (which sits inside PremiumSkinProvider).
export function PremiumSkinGuard() {
  const { tier, loaded } = useAuthState();
  const { skin, setSkin } = usePremiumSkin();
  useEffect(() => {
    if (!loaded) return;
    if (skin && !skinAllowed(skin, tier)) setSkin(null);
  }, [tier, loaded, skin, setSkin]);
  return null;
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
 * popover and directly in the mobile hamburger menu. Drives the shared skin
 * context, so every consumer (navbar dot, page structure) updates at once.
 * Options the current tier can't use become upsell links to /subscribe.
 */
export function PremiumSkinOptions({
  onPick,
  onClose,
}: {
  onPick?: (skin: SkinId | null) => void;
  onClose?: () => void;
}) {
  const { locale } = useLocale();
  const { tier, loaded } = useAuthState();
  const { skin: active, setSkin } = usePremiumSkin();
  const zh = locale === "zh";

  const choose = (skin: SkinId | null) => {
    setSkin(skin);
    onPick?.(skin);
  };

  const row =
    "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.06)]";

  return (
    <>
      <button type="button" role="menuitemradio" aria-checked={active === null} onClick={() => choose(null)} className={row}>
        <span className="flex items-center gap-2.5">
          <span aria-hidden className="h-3.5 w-3.5 shrink-0 rounded-full border border-[rgb(var(--muted))]" />
          {zh ? "标准（关闭）" : "Standard (off)"}
        </span>
        {active === null ? <Check className="h-4 w-4" /> : null}
      </button>

      {SKIN_ORDER.map((id) => {
        // Gate exactly like the membership skin picker: paid perk, Champion = Max.
        if (skinAllowed(id, tier)) {
          return (
            <button key={id} type="button" role="menuitemradio" aria-checked={active === id} onClick={() => choose(id)} className={row}>
              <span className="flex items-center gap-2.5">
                <Swatch id={id} />
                {skinLabel(id, zh)}
              </span>
              {active === id ? <Check className="h-4 w-4" /> : null}
            </button>
          );
        }
        // Locked → route to the membership page (upsell), like the subscribe
        // page's lock treatment. Champion shows "Max only"; the rest a member lock.
        const tag = isMaxExclusiveSkin(id) ? (zh ? "Max 限定" : "Max") : (zh ? "会员" : "Members");
        return (
          <Link key={id} href="/subscribe" onClick={() => onClose?.()} aria-disabled className={`${row} opacity-70`}>
            <span className="flex items-center gap-2.5">
              <Swatch id={id} />
              {skinLabel(id, zh)}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <span className="rounded-full bg-[rgb(var(--text)/0.08)] px-1.5 py-0.5 text-[0.5rem] font-bold uppercase tracking-wide text-[rgb(var(--subtext))]">
                {tag}
              </span>
              <Lock className="h-3.5 w-3.5 text-[rgb(var(--subtext))]" />
            </span>
          </Link>
        );
      })}

      {loaded && !isPaidTier(tier) ? (
        <Link
          href="/subscribe"
          onClick={() => onClose?.()}
          className="mt-0.5 flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-[rgb(var(--brand))] transition hover:bg-[rgb(var(--text)/0.06)]"
        >
          {zh ? "开通会员解锁整站皮肤" : "Unlock site-wide skins"}
        </Link>
      ) : null}
    </>
  );
}

export function PremiumSkinToggle({ className }: { className?: string }) {
  const { locale } = useLocale();
  const { tier, loaded } = useAuthState();
  const zh = locale === "zh";
  const [open, setOpen] = useState(false);
  const { skin } = usePremiumSkin();
  const wrapRef = useRef<HTMLDivElement>(null);

  // Optimistic before auth resolves; once loaded, only reflect an entitled skin
  // as active (PremiumSkinGuard clears an unentitled one in parallel).
  const active = !skin || !loaded || skinAllowed(skin, tier) ? skin : null;

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
          <PremiumSkinOptions onPick={() => setOpen(false)} onClose={() => setOpen(false)} />
          <p className="px-3 pb-1 pt-1.5 text-[0.68rem] leading-snug text-[rgb(var(--subtext))]">
            {zh ? "整站换肤 · 重排版式，浅色/深色都适配。" : "Re-skins & re-lays-out the whole site, light & dark."}
          </p>
        </div>
      )}
    </div>
  );
}
