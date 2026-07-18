"use client";

// Pre-expiry renewal nudge. A membership "time pass" silently lapses to free at
// expiry — dropping the member's skin, precise sizing and premium model. This
// slim, skin-themed banner warns paid members within the final week and offers a
// one-tap renew, so they protect the perks they're already enjoying instead of
// discovering the loss after the fact. Permanent members never see it. Dismissal
// is remembered per calendar day so it nudges again tomorrow if still unrenewed.

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { Crown, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { resolveTier } from "@/lib/subscription/resolve";
import { isPaidTier, TIERS } from "@/lib/subscription/tiers";
import { skinPalette } from "@/lib/subscription/skins";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";

const WARN_WITHIN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function dismissKey(dayStamp: string) {
  return `sf-renewal-dismissed:${dayStamp}`;
}

export function MembershipRenewalBanner() {
  const { locale } = useLocale();
  const { userId, tier, skin, loaded } = useAuthState();
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const zh = locale === "zh";

  const paid = isPaidTier(tier);

  useEffect(() => {
    if (!loaded || !userId || !paid || !SUBSCRIBE_LIVE) return;
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    void supabase
      .from("profiles")
      .select("subscription_tier, subscription_expires_at, subscription_is_permanent")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const { tier: rowTier } = resolveTier(data);
        if (!isPaidTier(rowTier) || data.subscription_is_permanent || !data.subscription_expires_at) return;
        const ms = new Date(data.subscription_expires_at).getTime() - Date.now();
        if (Number.isNaN(ms) || ms <= 0) return;
        const days = Math.ceil(ms / DAY_MS);
        if (days > WARN_WITHIN_DAYS) return;
        // Per-day dismissal — nudges again the next day if still unrenewed.
        const stamp = new Date().toISOString().slice(0, 10);
        let seen = false;
        try {
          seen = window.localStorage.getItem(dismissKey(stamp)) === "1";
        } catch {
          /* storage blocked — just show it */
        }
        setDaysLeft(days);
        setDismissed(seen);
      });
    return () => {
      cancelled = true;
    };
  }, [loaded, userId, paid]);

  if (dismissed || daysLeft == null) return null;

  const pal = skinPalette(skin, tier);
  const cfg = TIERS[tier];

  function dismiss() {
    setDismissed(true);
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      window.localStorage.setItem(dismissKey(stamp), "1");
    } catch {
      /* ignore */
    }
  }

  const message = zh
    ? `你的 ${cfg.name} 会员将在 ${daysLeft} 天后到期 · 皮肤与精准尺码将暂停`
    : `Your ${cfg.name} membership ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} · skins & precise sizing will pause`;

  return (
    <div
      className="relative z-30"
      style={{ background: `linear-gradient(90deg, ${pal.accent}1f, ${pal.accent}0a)`, borderBottom: `1px solid ${pal.accent}33` }}
    >
      <div className="container-shell flex items-center gap-3 py-2">
        <Crown className="h-4 w-4 shrink-0" style={{ color: pal.accent }} aria-hidden />
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-[rgb(var(--text))]">{message}</p>
        <Link
          href={"/subscribe" as Route}
          className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
          style={{ background: pal.badgeFill, border: `1px solid ${pal.badgeBorder}`, color: pal.badgeInk }}
        >
          {zh ? "续费" : "Renew"}
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label={zh ? "关闭" : "Dismiss"}
          className="shrink-0 rounded-full p-1 text-[rgb(var(--subtext))] transition hover:text-[rgb(var(--text))]"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
