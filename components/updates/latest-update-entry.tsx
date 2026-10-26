"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { CatalogueRunSummary } from "@/lib/catalogue-updates";

export function LatestUpdateEntry({ latest }: { latest: CatalogueRunSummary | null }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const counts = latest?.report.counts;
  const status = latest ? { completed: zh ? "运行完成" : "Run completed", partial: zh ? "部分完成" : "Partially completed", failed: zh ? "本次未完成" : "Run unsuccessful" }[latest.status] : "";
  return (
    <section className="container-shell py-8 md:py-12" aria-labelledby="catalogue-updates-heading" data-no-translate="true">
      <div className="flex flex-col gap-5 border-y border-[rgb(var(--glass-stroke-soft)/0.6)] py-6 sm:flex-row sm:items-center sm:justify-between md:py-8">
        <div className="min-w-0 max-w-2xl">
          <p className="t-eyebrow">{zh ? "资料持续维护" : "A living catalogue"}</p>
          <h2 id="catalogue-updates-heading" className="mt-2 text-xl font-semibold tracking-[-0.02em] md:text-2xl">
            {zh ? "每周资料更新" : "Weekly catalogue updates"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed soft-text">
            {latest && counts
              ? zh
                ? `${latest.scheduled_for} 批次 · ${status} · 新增 ${counts.added} · 修正 ${counts.updated} · 轮查 ${counts.recheckAttempted}（核实 ${counts.recheckVerified}） · 待核实 ${counts.pending}`
                : `${latest.scheduled_for} run · ${status} · ${counts.added} added · ${counts.updated} updated · ${counts.recheckAttempted} rechecked (${counts.recheckVerified} verified) · ${counts.pending} pending`
              : zh ? "查看新增鞋款、资料修正与仍在核实的问题。每次维护均保留完整记录。" : "New shoes, corrected details and open questions. A complete record of every maintenance run."}
          </p>
        </div>
        <Link href={(latest ? `/updates#run-${latest.id}` : "/updates") as Route}
          className="inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-lg px-1 text-sm font-medium underline-offset-4 transition hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.35)] sm:self-center">
          {zh ? "查看完整记录" : "Read the full record"}<ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
