"use client";

import Link from "next/link";
import { useState } from "react";
import type { Route } from "next";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { groupMaintenanceRuns, type CatalogueRunSummary, type CatalogueUpdatesResult } from "@/lib/catalogue-updates";

type ArchiveResult = Omit<CatalogueUpdatesResult, "runs"> & { runs: CatalogueRunSummary[] };

function dateLabel(date: string, locale: "en" | "zh", options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { ...options, timeZone: "Asia/Shanghai" }).format(new Date(`${date}T00:00:00+08:00`));
}

export function UpdatesTimeline({ result }: { result: ArchiveResult }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const [category, setCategory] = useState<"all" | "catalogue" | "ai_api">("all");
  const groups = groupMaintenanceRuns(result.runs.filter((run) => category === "all" || (run.report.category ?? "catalogue") === category));
  const latestId = groups[0]?.runs[0]?.id;
  return (
    <main className="container-shell pt-10 md:pt-16" style={{ paddingBottom: "calc(var(--mobile-nav-h) + 3rem)" }} data-no-translate="true">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-col justify-between gap-6 border-b border-[rgb(var(--glass-stroke-soft)/0.7)] pb-8 md:flex-row md:items-end md:pb-10">
          <div className="max-w-2xl">
            <p className="t-eyebrow">{zh ? "SNEAKERFEATURE · 维护记录" : "SNEAKERFEATURE · MAINTENANCE JOURNAL"}</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em] md:text-6xl">{zh ? "每次维护，有据可查。" : "Every update, on record."}</h1>
            <p className="mt-4 max-w-xl text-base leading-relaxed soft-text">{zh ? "球鞋资料每周更新，AI 接口每日检查。选择一次维护，查看改动、验证结果与未解决事项。" : "Weekly catalogue updates and daily AI checks. Explore changes, verification results and unresolved findings."}</p>
          </div>
          <p className="flex shrink-0 items-center gap-2 text-sm soft-text"><CalendarDays className="h-4 w-4" aria-hidden="true" />{zh ? "球鞋每周日 · AI 每日 12:00（北京）" : "Catalogue Sundays · AI daily at 12:00 Beijing"}</p>
        </header>

        {result.state === "unavailable" ? <section role="status" className="py-14"><h2 className="text-xl font-semibold">{zh ? "更新记录暂时无法加载" : "Update records are temporarily unavailable"}</h2><p className="mt-3 text-sm soft-text">{zh ? "请稍后重试，查看完整的维护记录。" : "Please try again shortly to read the maintenance records."}</p><button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex min-h-11 items-center rounded-xl border px-5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current">{zh ? "重新加载" : "Reload records"}</button></section>
          : groups.length === 0 ? <section className="py-14"><h2 className="text-xl font-semibold">{zh ? "此类别暂无维护记录" : "No reports in this category yet"}</h2><p className="mt-3 text-sm soft-text">{zh ? "每次维护的结果将在这里归档。" : "The results of each maintenance run will be archived here."}</p></section> : null}
        {result.omittedInvalidRuns > 0 && result.state === "ready" ? <p role="status" className="mt-8 border-l-2 border-[rgb(var(--accent)/0.6)] pl-4 text-sm soft-text">{zh ? "部分记录正在核对，暂时无法显示。" : "Some records need review and cannot be displayed yet."}</p> : null}

        <div className="mt-8 flex flex-wrap gap-2" role="group" aria-label={zh ? "维护类别" : "Maintenance category"}>
          {(["all", "catalogue", "ai_api"] as const).map((value) => <button key={value} type="button" aria-pressed={category === value} onClick={() => setCategory(value)} className={`min-h-11 rounded-full border px-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current ${category === value ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))]" : "soft-text"}`}>{value === "all" ? (zh ? "全部维护" : "All maintenance") : value === "ai_api" ? (zh ? "AI 接口" : "AI APIs") : (zh ? "球鞋资料" : "Catalogue")}</button>)}
        </div>
        <div className="mt-10 space-y-10 md:space-y-14">
          {groups.map((group) => <section key={group.week} aria-labelledby={`week-${group.week}`}>
            <div className="mb-5 flex items-center gap-4"><h2 id={`week-${group.week}`} className="shrink-0 text-sm font-medium">{zh ? `${dateLabel(group.week, locale, { month: "long", day: "numeric" })}起的一周` : `Week of ${dateLabel(group.week, locale, { month: "short", day: "numeric" })}`}</h2><span className="h-px flex-1 bg-[rgb(var(--glass-stroke-soft)/0.45)]" /><span className="text-xs soft-text">{group.runs.length}{zh ? " 次维护" : group.runs.length === 1 ? " report" : " reports"}</span></div>
            <ol className="grid gap-4 md:grid-cols-2">{group.runs.map((run) => <RunCard key={run.id} run={run} locale={locale} latest={run.id === latestId} />)}</ol>
          </section>)}
        </div>
        {groups.length > 0 ? <p className="mt-10 text-xs leading-relaxed soft-text">{zh ? "按计划维护日期归档；每份记录保留实际完成时间与未解决的问题。" : "Archived by scheduled maintenance date. Each report preserves its completion time and unresolved findings."}</p> : null}
      </div>
    </main>
  );
}

function RunCard({ run, locale, latest }: { run: CatalogueRunSummary; locale: "en" | "zh"; latest: boolean }) {
  const zh = locale === "zh";
  const c = run.report.counts;
  const ai = run.report.category === "ai_api";
  const status = { completed: zh ? "已完成" : "Completed", partial: zh ? "部分完成" : "Partially completed", failed: zh ? "未完成" : "Unsuccessful" }[run.status];
  return <li id={`run-${run.id}`} className="min-w-0 scroll-mt-24">
    <Link href={`/updates/${run.id}` as Route} prefetch={false} className="group flex h-full flex-col rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.7)] bg-[rgb(var(--bg-elev)/0.8)] p-5 transition-[border-color,box-shadow] hover:border-[rgb(var(--text)/0.4)] hover:shadow-lg hover:shadow-[rgb(var(--shadow)/0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.6)] focus-visible:ring-offset-4 focus-visible:ring-offset-[rgb(var(--bg))] sm:p-6" aria-labelledby={`title-${run.id}`} data-run-card={run.id}>
      <div className="flex items-start justify-between gap-3">
        <time dateTime={run.scheduled_for} className="flex items-baseline gap-2"><span className="num-display text-4xl font-medium tracking-[-0.06em]">{run.scheduled_for.slice(8)}</span><span className="text-xs soft-text">{dateLabel(run.scheduled_for, locale, { year: "numeric", month: "short" })}</span></time>
        <div className="flex flex-wrap justify-end gap-2 text-xs">{latest ? <span className="rounded-full bg-[rgb(var(--text))] px-3 py-1 text-[rgb(var(--bg))]">{zh ? "最新" : "Latest"}</span> : null}<span className="rounded-full border border-[rgb(var(--glass-stroke-soft)/0.8)] px-3 py-1 soft-text">{status}</span></div>
      </div>
      <p className="mt-4 text-xs soft-text">{ai ? (zh ? "AI 接口维护" : "AI API maintenance") : (zh ? "球鞋资料维护" : "Catalogue maintenance")}</p>
      <h3 id={`title-${run.id}`} className="mt-5 text-xl font-semibold leading-snug tracking-[-0.02em]">{run.report.title[locale]}</h3>
      <p className="mt-3 line-clamp-2 text-sm leading-6 soft-text">{run.report.summary[locale]}</p>
      <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-[rgb(var(--glass-stroke-soft)/0.4)] pt-4">{[[ai ? (zh ? "检查项" : "Checks") : (zh ? "新增鞋款" : "Added"), ai ? c.recheckAttempted : c.added], [ai ? (zh ? "通过" : "Passed") : (zh ? "修正与补全" : "Updated"), ai ? c.recheckVerified : c.updated], [zh ? "待核实" : "Pending", c.pending]].map(([label, value]) => <div key={label}><dt className="text-xs soft-text">{label}</dt><dd className="num-display mt-1 text-xl font-medium">{value}</dd></div>)}</dl>
      <div className="mt-auto flex items-center justify-between gap-3 pt-6 text-xs"><span className="soft-text">{zh ? `复查 ${c.recheckAttempted} · 核实 ${c.recheckVerified}` : `${c.recheckAttempted} rechecked · ${c.recheckVerified} verified`}</span><span className="flex shrink-0 items-center gap-2 text-sm font-medium">{zh ? "查看详情" : "View report"}<ArrowRight className="h-4 w-4 transition-transform motion-safe:group-hover:translate-x-1" aria-hidden="true" /></span></div>
    </Link>
  </li>;
}
