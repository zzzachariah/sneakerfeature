"use client";

// What this one turn cost, shown under the answer.
//
// Before this, credits silently drained: the header pill jumped from 12 to 9 and
// nothing said which message did it. The chip makes every charge attributable
// and doubles as the entry point to the full usage panel.

import { Coins, Infinity as InfinityIcon, Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

type Props = {
  /** Units actually charged for this turn (0 on an unmetered turn). */
  charged: number;
  /** Which account paid. Absent on reloaded turns — inferred from `charged`. */
  billing?: "credits" | "allowance" | "unlimited";
  /** Opens the usage panel. */
  onOpenUsage?: () => void;
};

export function MessageCost({ charged, billing, onOpenUsage }: Props) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";

  // A reloaded message carries only `credits_charged`; treat 0 as "included".
  const mode = billing ?? (charged > 0 ? "credits" : "unlimited");

  const { icon, text } =
    mode === "allowance"
      ? {
          icon: <Sparkles className="h-3 w-3" aria-hidden />,
          text: zh ? `本次消耗 ${charged} 点高级额度` : `${charged} from your premium allowance`
        }
      : mode === "credits" && charged > 0
        ? {
            icon: <Coins className="h-3 w-3" aria-hidden />,
            text: zh ? `本次消耗 ${charged} 积分` : `${charged} ${charged === 1 ? "credit" : "credits"} used`
          }
        : {
            icon: <InfinityIcon className="h-3 w-3" aria-hidden />,
            text: zh ? "本次不计费（会员权益）" : "Included with your plan"
          };

  const content = (
    <>
      {icon}
      <span>{text}</span>
    </>
  );

  if (!onOpenUsage) {
    return (
      <span className="sp-cost inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium">
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenUsage}
      title={translate("View credit usage")}
      className="sp-cost sp-cost--button tap-44 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)]"
    >
      {content}
    </button>
  );
}
