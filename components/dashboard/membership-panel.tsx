"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { ChevronRight, Crown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { MemberBadge } from "@/components/subscribe/member-badge";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { TIERS, isPaidTier } from "@/lib/subscription/tiers";
import { resolveTier } from "@/lib/subscription/resolve";
import { skinPalette } from "@/lib/subscription/skins";

type Expiry = {
  isPermanent: boolean;
  expiresAt: string | null;
};

// Membership status card for the user center's Overview section. Reads tier +
// skin from the shared auth state (instant, sessionStorage-cached) and lazily
// fetches the expiry fields on its own so DashboardPage's query batch and the
// DashboardSlides prop tunnel stay untouched.
export function MembershipPanel() {
  const { translate } = useLocale();
  const { signedIn, isAdmin, userId, tier, skin, loaded } = useAuthState();
  const [expiry, setExpiry] = useState<Expiry | null>(null);

  const paid = isPaidTier(tier);

  useEffect(() => {
    if (!userId || !paid) return;
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    // Tolerant fetch — the membership columns live behind migration 041, so a
    // pre-migration deployment simply keeps the status line minimal.
    void supabase
      .from("profiles")
      .select("subscription_tier, subscription_expires_at, subscription_is_permanent")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const { tier: rowTier } = resolveTier(data);
        setExpiry({
          isPermanent: Boolean(data.subscription_is_permanent) && isPaidTier(rowTier),
          expiresAt: isPaidTier(rowTier) ? (data.subscription_expires_at ?? null) : null
        });
      });
    return () => {
      cancelled = true;
    };
  }, [userId, paid]);

  if (!loaded || !signedIn) return null;
  // The /subscribe page is admin-only while payments are being finished, so a
  // free member without access gets no dead-end upsell card.
  if (!paid && !SUBSCRIBE_LIVE && !isAdmin) return null;

  const canOpenSubscribe = SUBSCRIBE_LIVE || isAdmin;
  const cfg = TIERS[tier];
  const pal = skinPalette(skin, tier);

  // Admins are shown as Max without a subscription row; leave their status at
  // the bare tier name until a real expiry (or permanent flag) is loaded.
  const statusLine = !paid
    ? translate("Free plan")
    : expiry?.isPermanent
      ? `${cfg.name} · ${translate("Permanent")}`
      : expiry?.expiresAt
        ? `${cfg.name} · ${translate("Valid until")} ${new Date(expiry.expiresAt).toLocaleDateString()}`
        : cfg.name;

  const body = paid ? (
    <div
      className="premium-hover-lift relative flex items-center gap-4 overflow-hidden rounded-2xl p-5"
      style={{ background: pal.cardBg, color: pal.cardInk }}
    >
      <span
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl"
        style={{ backgroundColor: pal.badgeFill, border: `1px solid ${pal.badgeBorder}`, color: pal.accentSoft }}
        aria-hidden
      >
        {pal.emblem}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-semibold">
          {translate("Membership")}
          <MemberBadge tier={tier} skin={skin} />
        </p>
        <p className="mt-0.5 truncate text-xs" style={{ opacity: 0.75 }}>
          {statusLine}
        </p>
      </div>
      {canOpenSubscribe && (
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold"
          style={{ backgroundColor: pal.badgeFill, border: `1px solid ${pal.badgeBorder}`, color: pal.badgeInk }}
        >
          {translate("Manage membership")}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  ) : (
    <div className="premium-hover-lift glass-lite flex items-center gap-4 rounded-2xl p-5">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)]">
        <Crown className="h-5 w-5" style={{ color: "#d9b45a" }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[rgb(var(--text))]">{translate("Membership")}</p>
        <p className="mt-0.5 truncate text-xs soft-text">
          {translate("Unlock stronger AI models, precise sizing, and luxury skins.")}
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[rgb(var(--text)/0.08)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--text))]">
        {translate("Upgrade")}
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
    </div>
  );

  if (!canOpenSubscribe) return body;

  return (
    <Link href={"/subscribe" as Route} prefetch={true} aria-label={translate("Membership")} className="block">
      {body}
    </Link>
  );
}
