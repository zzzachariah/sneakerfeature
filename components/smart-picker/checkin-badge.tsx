"use client";

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Timer } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { CheckinStatus } from "@/lib/ai/checkin";

type Props = {
  checkin: CheckinStatus;
  onClaim: () => Promise<void>;
  size?: "sm" | "md";
};

function computeRemainingMs(nextClaimAt: string | null): number {
  if (!nextClaimAt) return 0;
  return Math.max(0, new Date(nextClaimAt).getTime() - Date.now());
}

function formatRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function CheckinBadge({ checkin, onClaim, size = "sm" }: Props) {
  const { translate } = useLocale();
  const [busy, setBusy] = useState(false);

  // Used only to force a re-render once a second while we're in cooldown.
  // The actual remaining time is *derived* from `checkin.nextClaimAt` on
  // every render, so a fresh `checkin` prop coming back from a successful
  // claim is reflected immediately — no stale-state flash where the gold
  // badge briefly stays on screen because the previous remainingMs was 0.
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (checkin.canClaim || !checkin.nextClaimAt) return;
    const t = setInterval(() => forceTick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [checkin.canClaim, checkin.nextClaimAt]);

  const handleClick = useCallback(
    async (e: React.MouseEvent | React.KeyboardEvent) => {
      // Sits inside the wallet button — stop bubbling so the click doesn't
      // also open the recharge modal.
      e.stopPropagation();
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        await onClaim();
      } finally {
        setBusy(false);
      }
    },
    [busy, onClaim]
  );

  // Hide entirely when we haven't loaded a status yet (initial mount).
  if (!checkin.canClaim && !checkin.nextClaimAt) return null;

  const remainingMs = computeRemainingMs(checkin.nextClaimAt);
  // Local clock may have ticked past the cooldown before the server status
  // was refreshed — treat the badge as claimable in that case.
  const effectiveCanClaim =
    checkin.canClaim || (checkin.nextClaimAt !== null && remainingMs <= 0);

  const sizeClasses =
    size === "md" ? "h-7 px-2.5 text-xs gap-1.5" : "h-5 px-1.5 text-[0.7rem] gap-1";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  if (effectiveCanClaim) {
    return (
      <span
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") void handleClick(e);
        }}
        aria-busy={busy}
        aria-label={translate("Claim daily bonus")}
        title={`${translate("Claim daily bonus")} (+${checkin.dailyAmount} ${translate("credits")})`}
        className={`inline-flex items-center rounded-full bg-gradient-to-br from-yellow-300 via-amber-500 to-yellow-600 font-bold text-white shadow-[0_2px_8px_rgb(245_158_11_/_0.55),inset_0_1px_0_rgb(255_255_255_/_0.4)] ring-1 ring-amber-300/70 transition hover:shadow-[0_2px_12px_rgb(245_158_11_/_0.75),inset_0_1px_0_rgb(255_255_255_/_0.5)] ${sizeClasses} ${busy ? "opacity-70" : "animate-[pulse_2.4s_ease-in-out_infinite]"} cursor-pointer select-none`}
      >
        {busy ? <Loader2 className={`${iconSize} animate-spin`} /> : <Coins className={iconSize} />}
        +{checkin.dailyAmount}
      </span>
    );
  }

  const countdown = formatRemaining(remainingMs);
  return (
    <span
      aria-label={`${translate("Next daily bonus in")} ${countdown}`}
      title={`${translate("Next daily bonus in")} ${countdown}`}
      className={`inline-flex items-center rounded-full bg-[rgb(var(--text)/0.06)] font-medium text-[rgb(var(--subtext))] ring-1 ring-[rgb(var(--text)/0.08)] ${sizeClasses} cursor-default select-none tabular-nums`}
    >
      <Timer className={iconSize} />
      {countdown}
    </span>
  );
}
