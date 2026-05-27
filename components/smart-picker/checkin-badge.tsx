"use client";

import { useCallback, useState } from "react";
import { Coins, Loader2 } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

type Props = {
  canClaim: boolean;
  dailyAmount: number;
  onClaim: () => Promise<void>;
  size?: "sm" | "md";
};

export function CheckinBadge({ canClaim, dailyAmount, onClaim, size = "sm" }: Props) {
  const { translate } = useLocale();
  const [busy, setBusy] = useState(false);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      // The badge sits inside the balance display; stop propagation so a click
      // on the coin can't bubble to any surrounding interactive element.
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

  if (!canClaim) return null;

  const sizeClasses =
    size === "md"
      ? "h-7 px-2.5 text-xs gap-1.5"
      : "h-5 px-1.5 text-[0.7rem] gap-1";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") void handleClick(e as unknown as React.MouseEvent);
      }}
      aria-busy={busy}
      aria-label={translate("Claim daily bonus")}
      title={`${translate("Claim daily bonus")} (+${dailyAmount} ${translate("credits")})`}
      className={`inline-flex items-center rounded-full border border-amber-400/60 bg-gradient-to-br from-amber-200/40 to-amber-500/30 font-semibold text-amber-700 shadow-[0_0_0_2px_rgb(251_191_36_/_0.15)] transition hover:from-amber-200/60 hover:to-amber-500/50 hover:shadow-[0_0_0_3px_rgb(251_191_36_/_0.25)] dark:text-amber-200 ${sizeClasses} ${busy ? "opacity-60" : "animate-[pulse_2.4s_ease-in-out_infinite]"} cursor-pointer select-none`}
    >
      {busy ? <Loader2 className={`${iconSize} animate-spin`} /> : <Coins className={iconSize} />}
      +{dailyAmount}
    </span>
  );
}
