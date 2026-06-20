"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, Zap } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

// The homepage's one brand-accented primary CTA — the shortest path to a pick
// for the "just tell me what to buy" crowd. Free, no account, no AI credits.
export function QuickPickerEntry() {
  const { translate } = useLocale();
  return (
    <div className="container-shell py-2">
      <Link
        href={"/quick-picker" as Route}
        className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-[rgb(var(--brand)/0.35)] bg-[rgb(var(--brand)/0.08)] p-4 transition hover:border-[rgb(var(--brand)/0.55)] active:scale-[0.995]"
      >
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[rgb(var(--brand))] text-[rgb(var(--brand-contrast))]">
          <Zap className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[0.98rem] font-semibold tracking-[-0.01em]">
            {translate("Find your pair in 30 seconds")}
          </p>
          <p className="truncate text-[0.82rem] soft-text">
            {translate("Answer 3 quick questions — no account needed.")}
          </p>
        </div>
        <ArrowRight className="h-5 w-5 shrink-0 text-[rgb(var(--brand))] transition group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
