"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Crown, Gift, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { MemberBadge } from "@/components/subscribe/member-badge";
import { MembershipCard } from "@/components/subscribe/membership-card";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { TIERS, isPaidTier } from "@/lib/subscription/tiers";
import { resolveTier, memberSerial, parseSubscriptionSource, type SubscriptionRow } from "@/lib/subscription/resolve";
import { captureNodeToBlob, triggerDownload, safeFilename } from "@/lib/card/capture";
import { shareContent, canShareFiles } from "@/lib/native/native";
import { haptics } from "@/lib/native/haptics";

type Expiry = {
  isPermanent: boolean;
  expiresAt: string | null;
  startedAt: string | null;
  /** True when this membership was gifted/comped rather than bought. */
  isGift: boolean;
};

// Membership status card for the user center's Overview section. Reads tier +
// skin from the shared auth state (instant, localStorage-cached across tabs) and
// lazily fetches the expiry/started fields on its own so DashboardPage's query
// batch and the DashboardSlides prop tunnel stay untouched. Paid members get
// their own personalized, flippable, shareable luxury card; free users get an
// upgrade prompt.
export function MembershipPanel() {
  const { translate } = useLocale();
  // subscriptionTier (not the effective `tier`) — this panel states what plan
  // the member is actually on, so an admin with a Pro subscription must see a
  // Pro card here, not the Max treatment admins get for feature gating.
  const { signedIn, isAdmin, userId, username, subscriptionTier, skin, loaded } = useAuthState();
  const [expiry, setExpiry] = useState<Expiry | null>(null);
  const [sharing, setSharing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  const paid = isPaidTier(subscriptionTier);

  useEffect(() => {
    if (!userId || !paid) return;
    const supabase = createClient();
    if (!supabase) return;
    let cancelled = false;
    // Tolerant fetch — the membership columns live behind migration 041 and
    // subscription_source behind 047, so a pre-migration deployment simply keeps
    // the status line minimal instead of erroring.
    const BASE = "subscription_tier, subscription_expires_at, subscription_is_permanent, subscription_started_at";
    void (async () => {
      const read = (columns: string) =>
        supabase.from("profiles").select(columns).eq("id", userId).maybeSingle();
      const attempt = await read(`${BASE}, subscription_source`);
      const { data } = attempt.error ? await read(BASE) : attempt;
      if (cancelled || !data) return;
      const row = data as unknown as SubscriptionRow & { subscription_started_at?: string | null };
      const { tier: rowTier } = resolveTier(row);
      const isPaid = isPaidTier(rowTier);
      setExpiry({
        isPermanent: Boolean(row.subscription_is_permanent) && isPaid,
        expiresAt: isPaid ? (row.subscription_expires_at ?? null) : null,
        startedAt: row.subscription_started_at ?? null,
        isGift: isPaid && parseSubscriptionSource(row.subscription_source) === "gift"
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, paid]);

  if (!loaded || !signedIn) return null;
  // The /subscribe page is admin-only while payments are being finished, so a
  // free member without access gets no dead-end upsell card.
  if (!paid && !SUBSCRIBE_LIVE && !isAdmin) return null;

  const canOpenSubscribe = SUBSCRIBE_LIVE || isAdmin;
  const cfg = TIERS[subscriptionTier];
  const serial = userId ? memberSerial(userId) : null;

  const gifted = Boolean(expiry?.isGift);
  const statusLine = !paid
    ? translate("Free plan")
    : expiry?.isPermanent
      ? `${cfg.name} · ${translate("Permanent")}`
      : expiry?.expiresAt
        ? `${cfg.name} · ${translate("Valid until")} ${new Date(expiry.expiresAt).toLocaleDateString()}`
        : cfg.name;

  async function onShare() {
    if (sharing || !captureRef.current) return;
    setSharing(true);
    haptics.tap();
    try {
      const blob = await captureNodeToBlob(captureRef.current);
      const file = new File([blob], safeFilename([username, cfg.name, "membership"]), { type: "image/png" });
      if (canShareFiles([file])) {
        await shareContent({
          files: [file],
          title: "sneakerfeature",
          text: `${cfg.name} · sneakerfeature`
        });
      } else {
        triggerDownload(blob, file.name);
      }
    } catch {
      /* user cancelled or capture failed — nothing to surface */
    } finally {
      setSharing(false);
    }
  }

  // ── Free / upsell ──────────────────────────────────────────────────────────
  if (!paid) {
    const body = (
      <div className="premium-hover-lift glass-lite flex items-center gap-4 rounded-2xl p-5">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)]">
          <Crown className="h-5 w-5" style={{ color: "rgb(var(--gold-ink))" }} />
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

  // ── Paid: the member's own luxury card ──────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="w-full max-w-[320px]">
        <MembershipCard
          tier={subscriptionTier as "pro" | "max"}
          skin={skin}
          active
          flippable
          holder={username}
          memberSince={expiry?.startedAt ?? null}
          serial={serial}
          validThrough={expiry?.expiresAt ?? null}
          permanent={Boolean(expiry?.isPermanent)}
          gift={gifted}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <p className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--text))]">
          {translate("Membership")}
          <MemberBadge tier={subscriptionTier} skin={skin} />
          {/* A gifted plan is stated plainly wherever the member sees their own
              status — the perks match a paid plan, but it isn't refundable. */}
          {gifted && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide"
              style={{ color: "#12b886", backgroundColor: "#12b8861f", border: "1px solid #12b88655" }}
            >
              <Gift className="h-2.5 w-2.5" aria-hidden />
              {translate("Gifted")}
            </span>
          )}
        </p>
        <p className="truncate text-xs soft-text">{statusLine}</p>
        {gifted && (
          <p className="text-xs soft-text">
            {translate("A gifted membership — same perks, but it can't be refunded.")}
          </p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {canOpenSubscribe && (
            <Link
              href={"/subscribe" as Route}
              prefetch={true}
              className="inline-flex items-center gap-1 rounded-full bg-[rgb(var(--text)/0.08)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.12)]"
            >
              {translate("Manage membership")}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          )}
          <button
            type="button"
            onClick={onShare}
            disabled={sharing}
            className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(var(--muted)/0.5)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.05)] disabled:opacity-60"
          >
            <Share2 className="h-3.5 w-3.5" />
            {sharing ? translate("Sharing…") : translate("Share card")}
          </button>
        </div>
      </div>

      {/* Offscreen, pristine front-only card used purely for share capture so the
          exported image is never mid-flip or mid-tilt. */}
      <div ref={captureRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 w-[640px]">
        <MembershipCard
          tier={subscriptionTier as "pro" | "max"}
          skin={skin}
          active
          interactive={false}
          holder={username}
          memberSince={expiry?.startedAt ?? null}
          serial={serial}
        />
      </div>
    </div>
  );
}
