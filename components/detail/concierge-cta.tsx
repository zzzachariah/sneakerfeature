"use client";

// Max-only "AI concierge" entry on the shoe page. Deep-links into the AI
// Advisor with the composer pre-filled with a personalized question about THIS
// shoe — a real back-and-forth conversation that remembers the member's persona,
// foot scan and allowance. Rendered only for Max members (gated server-side on
// the shoe page).

import Link from "next/link";
import type { Route } from "next";
import { Sparkles, ChevronRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

const GOLD = "#d9b45a";

export function ConciergeCta({ shoeName }: { shoeName: string }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const question = zh
    ? `帮我看看「${shoeName}」适不适合我的打法和脚型，值不值得入？`
    : `Is the "${shoeName}" right for my playstyle and feet — worth buying?`;
  const href = `/advisor?ask=${encodeURIComponent(question)}` as Route;

  return (
    <section className="mx-auto mt-4 w-full max-w-3xl px-4 sm:px-6">
      <Link
        href={href}
        className="premium-hover-lift flex items-center gap-4 rounded-2xl border p-4 sm:p-5"
        style={{ borderColor: `${GOLD}44`, background: `linear-gradient(90deg, ${GOLD}12, transparent)` }}
      >
        <span
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912f)`, color: "#1a1305" }}
        >
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--text))]">
            {zh ? "问 AI 导购这双鞋" : "Ask the AI concierge about this shoe"}
            <span
              className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide"
              style={{ color: "#1a1305", background: `linear-gradient(135deg, #ffe38a, #c99a2a)` }}
            >
              Max
            </span>
          </p>
          <p className="mt-0.5 truncate text-xs soft-text">
            {zh
              ? "结合你的打法与脚型，给出该不该买的专属建议。"
              : "A personalized verdict from your playstyle and foot scan."}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 soft-text" aria-hidden />
      </Link>
    </section>
  );
}
