"use client";

import Link from "next/link";
import { Crown, ArrowRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { isPaidTier } from "@/lib/subscription/tiers";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";

// Membership stays discoverable without interrupting a first visit.
export function MembershipPromo() {
  const { locale } = useLocale();
  const { tier, loaded } = useAuthState();
  if (!SUBSCRIBE_LIVE || !loaded || isPaidTier(tier)) return null;
  const zh = locale === "zh";
  return (
    <aside className="container-shell pb-10">
      <Link href="/subscribe" className="surface-card flex items-center gap-4 rounded-2xl p-5">
        <Crown className="h-5 w-5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <strong className="block text-sm">{zh ? "了解 Pro / Max 会员" : "Explore Pro / Max membership"}</strong>
          <span className="mt-1 block text-sm soft-text">{zh ? "更多 AI 模型、尺码建议和界面主题。" : "More AI models, sizing guidance, and interface themes."}</span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
      </Link>
    </aside>
  );
}
