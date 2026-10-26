"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { CatalogueRunSummary } from "@/lib/catalogue-updates";

export function LatestUpdateEntry({ latest }: { latest: CatalogueRunSummary | null }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const counts = latest?.report.counts;
  return (
    <section className="container-shell py-8 md:py-12" aria-labelledby="catalogue-updates-heading" data-no-translate="true">
      <div className="relative overflow-hidden rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.7)] bg-[rgb(var(--bg-elev))] p-6 md:p-8">
        <div className="absolute inset-y-0 left-0 w-1 bg-[rgb(var(--brand))]" aria-hidden="true" />
        <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-center">
          <div className="min-w-0 max-w-2xl">
            <p className="flex items-center gap-2 text-xs font-medium soft-text"><CalendarDays className="h-4 w-4" aria-hidden="true" />{zh ? "每周日 · 资料维护" : "Every Sunday · Catalogue maintenance"}</p>
            <h2 id="catalogue-updates-heading" className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.035em] md:text-3xl">{zh ? "篮球鞋资料库，每周更新。" : "Your basketball shoe catalogue. Updated weekly."}</h2>
            <p className="mt-3 text-sm leading-relaxed soft-text">{zh ? "持续收录新鞋，核对规格、实战表现与图片。每一次改动，都有记录可查。" : "New shoes, verified specs, performance research and checked images. Follow what changes with every update."}</p>
          </div>
          <Link href="/updates" className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 self-start rounded-xl bg-[rgb(var(--text))] px-5 text-sm font-semibold text-[rgb(var(--bg))] transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text))] focus-visible:ring-offset-4 focus-visible:ring-offset-[rgb(var(--bg-elev))] lg:self-center">{zh ? "查看更新记录" : "Explore updates"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        {latest && counts ? <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[rgb(var(--glass-stroke-soft)/0.5)] pt-4 text-xs soft-text"><time dateTime={latest.scheduled_for}>{zh ? "最近维护 " : "Latest maintenance "}{latest.scheduled_for}</time><span>{zh ? `新增 ${counts.added} · 修正 ${counts.updated} · 待核实 ${counts.pending}` : `${counts.added} added · ${counts.updated} updated · ${counts.pending} pending`}</span></div> : null}
      </div>
    </section>
  );
}
