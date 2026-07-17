"use client";

// One-time homepage upsell that recommends membership to non-members. Shows
// once per user (localStorage), only to free / signed-out visitors, and only
// when the membership surface is live. It deliberately waits for any other
// dialog (announcement / language / cookie flows) to close first — see the
// [data-modal-open] poll — so the user never gets two stacked popups.
//
// Rendered from the homepage (app/page.tsx) so the promo is scoped to the
// landing surface rather than following the user around the whole app. Paid
// members (Pro / Max, and admins who resolve to Max) never see it.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Crown, Sparkles, Ruler, Palette, ChevronRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { isPaidTier } from "@/lib/subscription/tiers";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";

const SEEN_KEY = "sf-membership-promo-seen";
const GOLD = "#d9b45a";

function hasSeen(): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen(): void {
  try {
    window.localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage blocked — it'll simply show again next visit */
  }
}

export function MembershipPromo() {
  const { locale } = useLocale();
  const { tier, loaded } = useAuthState();
  const [open, setOpen] = useState(false);
  const zh = locale === "zh";

  useEffect(() => {
    if (!SUBSCRIBE_LIVE) return;
    if (!loaded) return; // wait until we know whether they're a member
    if (isPaidTier(tier)) return; // members don't get upsold
    if (hasSeen()) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const tryOpen = () => {
      if (cancelled) return;
      // Never stack on top of another dialog (announcement / language / cookie).
      // Retry a bounded number of times, then give up for this session.
      if (document.querySelector("[data-modal-open]")) {
        if (tries++ < 20) timer = setTimeout(tryOpen, 1500);
        return;
      }
      setOpen(true);
    };

    timer = setTimeout(tryOpen, 1600);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [loaded, tier]);

  const dismiss = useCallback(() => {
    markSeen();
    setOpen(false);
  }, []);

  const benefits = zh
    ? [
        { icon: Sparkles, text: "更强的 AI 选鞋模型，基础推理不限次" },
        { icon: Ruler, text: "逐款精准尺码，结合你的脚型给建议" },
        { icon: Palette, text: "整站奢侈皮肤 + 专属徽章与个性化" }
      ]
    : [
        { icon: Sparkles, text: "A stronger AI picking model, unlimited base reasoning" },
        { icon: Ruler, text: "Per-shoe precise sizing, tuned to your foot scan" },
        { icon: Palette, text: "Site-wide luxury skins, a member badge & personalization" }
      ];

  return (
    <Modal open={open} onClose={dismiss} title="" dismissible zIndexClass="z-[115]">
      <div className="relative flex flex-col">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{
            background: `linear-gradient(135deg, ${GOLD}, #b8912f)`,
            color: "#1a1305",
            boxShadow: `0 12px 30px -14px ${GOLD}aa`
          }}
        >
          <Crown className="h-6 w-6" aria-hidden />
        </div>

        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.22em]" style={{ color: GOLD }}>
          {zh ? "会员" : "Membership"}
        </p>
        <h2 className="mt-2 text-[1.55rem] font-bold leading-[1.18] tracking-[-0.018em]">
          {zh ? "把选鞋，交给更强的大脑。" : "Give your shoe picks a smarter brain."}
        </h2>
        <p className="mt-2 text-[0.95rem] leading-[1.6] text-[rgb(var(--text)/0.75)]">
          {zh
            ? "开通 Pro / Max，解锁更强的 AI 模型、逐款精准尺码，以及一整套套用到整站的奢侈皮肤。"
            : "Unlock Pro / Max for a stronger AI model, per-shoe precise sizing, and a full set of luxury skins that theme the whole site."}
        </p>

        <ul className="mt-5 flex flex-col gap-3">
          {benefits.map((b) => {
            const Icon = b.icon;
            return (
              <li key={b.text} className="flex items-start gap-3 text-sm">
                <span
                  className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${GOLD}1f`, color: GOLD }}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="text-[rgb(var(--text)/0.82)]">{b.text}</span>
              </li>
            );
          })}
        </ul>

        <Link
          href="/subscribe"
          onClick={dismiss}
          className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition active:scale-[0.99]"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912f)`, color: "#1a1305" }}
        >
          <Crown className="h-4 w-4" aria-hidden />
          {zh ? "查看会员方案" : "See membership plans"}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>

        <button
          type="button"
          onClick={dismiss}
          className="mt-3 inline-flex h-9 items-center justify-center rounded-xl text-sm font-medium text-[rgb(var(--text)/0.55)] transition hover:text-[rgb(var(--text))]"
        >
          {zh ? "以后再说" : "Maybe later"}
        </button>
      </div>
    </Modal>
  );
}
