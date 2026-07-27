"use client";

// Compact premium-model allowance meter for paid members, shown in the
// smart-picker header beside the credits pill. Members otherwise can't see how
// much of their monthly quota is left before the pipeline silently falls back to
// the base model. The fill uses --brand, which is the member's skin accent, so
// the meter is themed to their card.

import { Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

export function AllowanceMeter({ balance, grant }: { balance: number; grant: number }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const pct = grant > 0 ? Math.max(0, Math.min(100, (balance / grant) * 100)) : 0;
  const low = balance <= grant * 0.15;

  return (
    <span
      className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-[rgb(var(--glass-stroke-soft)/0.55)] px-3 text-[0.78rem] font-medium"
      title={zh ? "高级模型额度" : "Premium model allowance"}
    >
      <Sparkles className="h-3.5 w-3.5" style={{ color: low ? "rgb(var(--error))" : "rgb(var(--brand))" }} aria-hidden />
      <span className="num-display">{balance}</span>
      <span className="soft-text">/ {grant}</span>
      <span className="relative h-1.5 w-8 overflow-hidden rounded-full bg-[rgb(var(--text)/0.12)]" aria-hidden>
        <span
          className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: low ? "rgb(var(--error))" : "rgb(var(--brand))" }}
        />
      </span>
    </span>
  );
}
