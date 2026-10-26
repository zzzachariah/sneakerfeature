"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { groupMaintenanceRuns, type CatalogueMaintenanceRun, type CatalogueUpdateEntry, type CatalogueUpdatesResult, type LocalizedText } from "@/lib/catalogue-updates";

const KIND_LABELS: Record<CatalogueUpdateEntry["kind"], LocalizedText> = {
  added: { en: "New entries", zh: "新增鞋款" }, updated: { en: "Corrections & additions", zh: "修正与补全" },
  unchanged: { en: "Verified, unchanged", zh: "核实后无改动" }, pending: { en: "Still under review", zh: "仍待核实" }, candidate: { en: "Candidates not published", zh: "未入库候选" },
};
const FIELD_LABELS: Record<string, LocalizedText> = {
  brand: { en: "Brand", zh: "品牌" }, shoe_name: { en: "Model", zh: "型号" }, identity: { en: "Model identity", zh: "型号身份" }, model_line: { en: "Series", zh: "系列" }, version_name: { en: "Version", zh: "版本" },
  release_year: { en: "Release year", zh: "发售年" }, player: { en: "Player", zh: "球员" }, category: { en: "Playing role", zh: "适配类别" }, weight: { en: "Weight", zh: "重量" },
  forefoot_midsole_tech: { en: "Forefoot cushioning", zh: "前掌缓震科技" }, heel_midsole_tech: { en: "Heel cushioning", zh: "后掌缓震科技" }, outsole_tech: { en: "Outsole", zh: "外底" }, upper_tech: { en: "Upper", zh: "鞋面" },
  cushioning_feel: { en: "Cushioning feel", zh: "缓震感受" }, court_feel: { en: "Court feel", zh: "场地感" }, bounce: { en: "Bounce", zh: "回弹" }, stability: { en: "Stability", zh: "稳定性" }, traction: { en: "Traction", zh: "抓地" }, fit: { en: "Fit", zh: "贴合" },
  containment: { en: "Containment", zh: "包裹" }, support: { en: "Support", zh: "支撑" }, torsional_rigidity: { en: "Torsional rigidity", zh: "抗扭" }, playstyle_summary: { en: "Playstyle", zh: "打法建议" }, story_summary: { en: "Background", zh: "背景概述" }, pro_summary: { en: "Strengths", zh: "优点" }, con_summary: { en: "Limitations", zh: "不足" }, tags: { en: "Tags", zh: "标签" }, story: { en: "Story", zh: "故事" }, image: { en: "Image", zh: "图片" }, images: { en: "Images", zh: "图片" },
};
const actionClass = "inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.35)]";

function calendarDate(date: string, locale: "en" | "zh") {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Shanghai" }).format(new Date(`${date}T00:00:00+08:00`));
}
function completedDate(date: string, locale: "en" | "zh") {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Shanghai" }).format(new Date(date));
}

export function UpdatesTimeline({ result }: { result: CatalogueUpdatesResult }) {
  const { locale } = useLocale(); const zh = locale === "zh";
  const groups = groupMaintenanceRuns(result.runs);
  return (
    <main className="container-shell pt-10 md:pt-16" style={{ paddingBottom: "calc(var(--mobile-nav-h) + 2rem)" }} data-no-translate="true">
      <div className="mx-auto max-w-4xl">
        <header className="max-w-2xl">
          <p className="t-eyebrow">{zh ? "资料更新记录" : "Catalogue journal"}</p>
          <h1 className="t-display-sm mt-3">{zh ? "每周，查得更清楚一点。" : "A clearer catalogue, week by week."}</h1>
          <p className="mt-5 text-base leading-[1.8] soft-text">{zh ? "新增了哪些鞋，哪些资料得到修正，还有什么没有查清。每次维护的结果与证据，都在这里留下记录。" : "Which shoes were added, which details changed, and what we still need to verify. Every maintenance run, with its evidence and open questions."}</p>
          <p className="mt-3 text-xs leading-relaxed soft-text">{zh ? "按北京时间自然周归档；计划日期与实际完成时间分别列出。轮查尝试与核实通过分别计数。" : "Grouped by Beijing calendar week. Scheduled dates and actual completion times are shown separately; attempted and verified checks are counted separately."}</p>
        </header>

        {result.state === "unavailable" ? <section role="status" className="mt-10 border-y border-[rgb(var(--glass-stroke-soft)/0.6)] py-8"><h2 className="text-lg font-semibold">{zh ? "更新记录暂时无法加载" : "Update records are temporarily unavailable"}</h2><p className="mt-2 text-sm leading-relaxed soft-text">{zh ? "请稍后重试，查看完整的维护记录。" : "Please try again shortly to read the complete maintenance records."}</p><a href="/updates" className={`${actionClass} mt-3`}>{zh ? "重新加载" : "Reload records"}</a></section>
          : groups.length === 0 ? <section className="mt-10 border-y border-[rgb(var(--glass-stroke-soft)/0.6)] py-8"><h2 className="text-lg font-semibold">{zh ? "首份维护记录尚未发布" : "The first maintenance record is not published yet"}</h2><p className="mt-2 text-sm leading-relaxed soft-text">{zh ? "已发布的完整简报会按周出现在这里，包括没有改动或仍待核实的结果。" : "Published reports will appear here by week, including unchanged shoes and unresolved checks."}</p></section> : null}

        {result.omittedInvalidRuns > 0 && result.state === "ready" ? <p role="status" className="mt-8 border-l-2 border-[rgb(var(--accent)/0.6)] pl-4 text-sm soft-text">{zh ? "部分记录暂时无法完整显示，正在核对。下方仅展示可读取的完整记录。" : "Some records could not be displayed completely and need review. Only complete, readable records are shown below."}</p> : null}

        <div className="mt-12 space-y-14 md:mt-16 md:space-y-20">
          {groups.map((group) => <section key={group.week} aria-labelledby={`week-${group.week}`}>
            <h2 id={`week-${group.week}`} className="t-eyebrow border-b border-[rgb(var(--glass-stroke-soft)/0.6)] pb-4">{zh ? "始于 " : "Week of "}{calendarDate(group.week, locale)}{zh ? " 的一周" : ""}</h2>
            <ol className="divide-y divide-[rgb(var(--glass-stroke-soft)/0.5)]">{group.runs.map((run) => <RunEntry key={run.id} run={run} locale={locale} />)}</ol>
          </section>)}
        </div>
      </div>
    </main>
  );
}

function RunEntry({ run, locale }: { run: CatalogueMaintenanceRun; locale: "en" | "zh" }) {
  const zh = locale === "zh"; const report = run.report; const c = report.counts;
  const status = { completed: zh ? "运行完成" : "Run completed", partial: zh ? "部分完成" : "Partially completed", failed: zh ? "本次未完成" : "Run unsuccessful" }[run.status];
  const checks = report.verification;
  return <li id={`run-${run.id}`} className="scroll-mt-24 py-8 md:py-10">
    <article>
      <header>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs soft-text"><time dateTime={run.scheduled_for}>{zh ? "计划日期 " : "Scheduled "}{calendarDate(run.scheduled_for, locale)}</time><span className="font-medium text-[rgb(var(--text))]">{status}</span></div>
        <h3 className="mt-3 text-2xl font-semibold leading-snug tracking-[-0.025em] md:text-3xl">{report.title[locale]}</h3>
        <p className="mt-3 whitespace-pre-line text-[0.95rem] leading-[1.8] soft-text">{report.summary[locale]}</p>
        <p className="mt-3 text-xs soft-text"><time dateTime={run.completed_at}>{zh ? "完成于 " : "Completed "}{completedDate(run.completed_at, locale)}</time>{zh ? "（北京时间）" : " (Beijing time)"}</p>
        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-4 border-y border-[rgb(var(--glass-stroke-soft)/0.45)] py-4 text-sm">
          {[[zh ? "新增" : "Added", c.added], [zh ? "修正／补全" : "Updated", c.updated], [zh ? "轮查尝试" : "Checks attempted", c.recheckAttempted], [zh ? "核实通过" : "Checks verified", c.recheckVerified], [zh ? "待核实" : "Pending", c.pending], [zh ? "未入库候选" : "Unpublished candidates", c.candidates]].map(([label, value]) => <div key={label}><dt className="text-xs soft-text">{label}</dt><dd className="num-display mt-1 text-lg font-medium">{value}</dd></div>)}
        </dl>
      </header>
      {(Object.keys(KIND_LABELS) as CatalogueUpdateEntry["kind"][]).map((kind) => {
        const entries = report.entries.filter((entry) => entry.kind === kind);
        return <section key={kind} className="mt-7" aria-label={KIND_LABELS[kind][locale]}>
          <h4 className="flex items-baseline gap-3 text-base font-semibold">{KIND_LABELS[kind][locale]}<span className="num-display text-xs font-normal soft-text">{entries.length}</span></h4>
          {entries.length ? <ul className="mt-1 divide-y divide-[rgb(var(--glass-stroke-soft)/0.3)]">{entries.map((entry, index) => <ShoeEntry key={`${entry.slug ?? entry.name}-${index}`} entry={entry} locale={locale} />)}</ul> : <p className="mt-2 text-sm soft-text">{zh ? "本次无此类记录。" : "None in this run."}</p>}
        </section>;
      })}
      {report.notes.length > 0 ? <div className="mt-7 space-y-2 border-l-2 border-[rgb(var(--glass-stroke-soft)/0.8)] pl-4 text-sm leading-relaxed soft-text">{report.notes.map((note, index) => <p key={index}>{note[locale]}</p>)}</div> : null}
      <details className="group mt-7 border-t border-[rgb(var(--glass-stroke-soft)/0.5)] pt-4">
        <summary className={`${actionClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{zh ? "本次验证范围" : "Verification scope"}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed soft-text">
          {[[zh ? "数据库写后读回" : "Database readback", checks.databaseReadback], [zh ? "匿名读取" : "Anonymous readback", checks.anonymousReadback], [zh ? "公开页面正文" : "Public page content", checks.publicBody], [zh ? "截图／视觉检查" : "Screenshots / visual inspection", checks.visualScreenshot]].map(([label, passed]) => <li key={String(label)}>{label}：{passed ? zh ? "已完成" : "Completed" : zh ? "未确认" : "Not confirmed"}</li>)}
          {checks.limitations.map((note, index) => <li key={`limitation-${index}`}>{note[locale]}</li>)}
        </ul>
      </details>
    </article>
  </li>;
}

function ShoeEntry({ entry, locale }: { entry: CatalogueUpdateEntry; locale: "en" | "zh" }) {
  const zh = locale === "zh";
  return <li className="min-w-0 py-5">
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h5 className="text-[0.98rem] font-semibold">{entry.slug ? <Link href={`/shoes/${entry.slug}` as Route} className="rounded underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.35)]">{entry.name}</Link> : entry.name}</h5>
      {entry.brand ? <span className="text-xs soft-text">{entry.brand}</span> : null}
    </div>
    <p className="mt-2 whitespace-pre-line text-sm leading-[1.8] soft-text [overflow-wrap:anywhere]">{entry.summary[locale]}</p>
    {entry.changes.length > 0 ? <details className="group mt-2">
      <summary className={`${actionClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{zh ? "逐项改动" : "Field-by-field changes"}<span className="num-display text-xs soft-text">{entry.changes.length}</span><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <dl className="mt-3 space-y-5 border-l border-[rgb(var(--glass-stroke-soft)/0.7)] pl-4">{entry.changes.map((change, index) => <div key={`${change.field}-${index}`}><dt className="text-sm font-medium">{change.label[locale]}</dt><dd className="mt-2 grid gap-3 text-sm leading-relaxed sm:grid-cols-2"><div><span className="mb-1 block text-xs soft-text">{zh ? "修改前" : "Before"}</span><p className="whitespace-pre-line soft-text [overflow-wrap:anywhere]">{change.before?.[locale] ?? (zh ? "未记录" : "Not recorded")}</p></div><div><span className="mb-1 block text-xs soft-text">{zh ? "修改后" : "After"}</span><p className="whitespace-pre-line [overflow-wrap:anywhere]">{change.after?.[locale] ?? (zh ? "未记录" : "Not recorded")}</p></div></dd></div>)}</dl>
    </details> : null}
    {entry.sources.length > 0 ? <details className="group mt-1">
      <summary className={`${actionClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{zh ? "证据与来源" : "Evidence & sources"}<span className="num-display text-xs soft-text">{entry.sources.length}</span><ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
      <ol className="mt-2 space-y-4 border-l border-[rgb(var(--glass-stroke-soft)/0.7)] pl-4">{entry.sources.map((source, index) => {
        const supported = [...new Set(source.supports.map((key) => FIELD_LABELS[key.replace(/_zh$/, "")]?.[locale]).filter(Boolean))];
        return <li key={`${source.url}-${index}`} className="text-sm leading-relaxed"><a href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 rounded underline decoration-[rgb(var(--text)/0.25)] underline-offset-4 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.35)] [overflow-wrap:anywhere]">{source.publisher}<ArrowUpRight className="mt-1 h-3 w-3 shrink-0" aria-hidden="true" /></a><p className="mt-1 text-xs soft-text">{zh ? "读取日期：" : "Read: "}{calendarDate(source.readDate, locale)}{supported.length > 0 ? `${zh ? " · 支持：" : " · Covers: "}${supported.join(zh ? "、" : ", ")}` : ""}</p>{source.note ? <p className="mt-1 whitespace-pre-line soft-text">{source.note[locale]}</p> : null}</li>;
      })}</ol>
    </details> : <p className="mt-2 text-xs soft-text">{zh ? "本次尚未取得可列出的证据来源；该项未标为核实通过。" : "No source evidence is recorded for this attempt; this entry is not marked verified."}</p>}
  </li>;
}
