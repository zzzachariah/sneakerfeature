"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleHelp, Search } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { CatalogueMaintenanceRun, CatalogueUpdateEntry, LocalizedText } from "@/lib/catalogue-updates";

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

const PAGE_SIZE = 8;
const KINDS = ["added", "updated", "unchanged", "pending", "candidate"] as const;
type Filter = "all" | CatalogueUpdateEntry["kind"];
const focusClass = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--bg))]";
const disclosureClass = `flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 rounded-lg text-sm font-medium [&::-webkit-details-marker]:hidden ${focusClass}`;

function calendarDate(date: string, locale: "en" | "zh", completed = false) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Shanghai",
    ...(completed ? { hour: "2-digit", minute: "2-digit", hour12: false } as const : {}),
  }).format(new Date(completed ? date : `${date}T00:00:00+08:00`));
}

export function UpdateDetail({ run }: { run: CatalogueMaintenanceRun }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const report = run.report;
  const c = report.counts;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const recordsRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const search = query.trim().toLocaleLowerCase();
  const matching = report.entries.filter((entry) => (filter === "all" || entry.kind === filter) && (!search || `${entry.name} ${entry.brand ?? ""}`.toLocaleLowerCase().includes(search)));
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const shown = matching.slice(start, start + PAGE_SIZE);
  const status = { completed: zh ? "已完成" : "Completed", partial: zh ? "部分完成" : "Partially completed", failed: zh ? "本次未完成" : "Unsuccessful" }[run.status];
  const filterLabel = filter === "all" ? (zh ? "全部记录" : "All records") : KIND_LABELS[filter][locale];
  const chooseFilter = (next: Filter) => { setFilter(next); setPage(1); };
  const showPending = () => {
    chooseFilter("pending");
    setQuery("");
    recordsRef.current?.scrollIntoView({ block: "start" });
    titleRef.current?.focus({ preventScroll: true });
  };
  const changePage = (next: number) => {
    setPage(next);
    recordsRef.current?.scrollIntoView({ block: "start" });
    titleRef.current?.focus({ preventScroll: true });
  };

  return <main className="container-shell pt-7 md:pt-10" style={{ paddingBottom: "calc(var(--mobile-nav-h) + 3rem)" }} data-no-translate="true" data-report-id={run.id}>
    <article className="mx-auto max-w-6xl">
      <Link href="/updates" className={`inline-flex min-h-11 items-center gap-2 rounded-lg text-sm soft-text hover:text-[rgb(var(--text))] ${focusClass}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{zh ? "全部更新" : "All updates"}</Link>
      <header className="mt-5 border-b border-[rgb(var(--glass-stroke-soft)/0.65)] pb-8 md:mt-7 md:pb-10">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <time dateTime={run.scheduled_for} className="font-medium">{calendarDate(run.scheduled_for, locale)}</time>
          <span className="h-3 w-px bg-[rgb(var(--glass-stroke-soft))]" aria-hidden="true" />
          <span className={run.status === "completed" ? "soft-text" : "font-medium text-[rgb(var(--gold-ink))]"}>{status}</span>
        </div>
        <h1 className="mt-5 max-w-4xl text-3xl font-semibold leading-[1.2] tracking-[-0.035em] sm:text-4xl md:text-5xl">{report.title[locale]}</h1>
        <p className="mt-5 max-w-3xl whitespace-pre-line text-base leading-[1.85] soft-text [overflow-wrap:anywhere]">{report.summary[locale]}</p>
        <p className="mt-4 text-xs leading-relaxed soft-text"><time dateTime={run.completed_at}>{zh ? "实际完成于 " : "Completed "}{calendarDate(run.completed_at, locale, true)}</time>{zh ? " · 北京时间" : " · Beijing time"}</p>
        <dl className="mt-8 grid grid-cols-3 gap-x-5 gap-y-6 border-t border-[rgb(var(--glass-stroke-soft)/0.4)] pt-6 sm:grid-cols-6">
          {[[zh ? "新增鞋款" : "New shoes", c.added], [zh ? "修正与补全" : "Updated", c.updated], [zh ? "尝试复查" : "Checks attempted", c.recheckAttempted], [zh ? "核实通过" : "Checks verified", c.recheckVerified], [zh ? "待核实" : "Pending", c.pending], [zh ? "未入库候选" : "Unpublished", c.candidates]].map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs leading-5 soft-text">{label}</dt><dd className="num-display mt-2 text-2xl font-medium sm:text-3xl">{value}</dd></div>)}
        </dl>
        <p className="mt-5 text-xs leading-relaxed soft-text">{zh ? "核实数量仅对应本次检查范围；具体范围及限制见页面下方。" : "Verified counts apply only to the scope of this run. Scope and limitations are recorded below."}</p>
      </header>

      {c.pending > 0 ? <aside className="mt-7 flex flex-col gap-3 rounded-xl border border-[rgb(var(--gold-line)/0.4)] bg-[rgb(var(--gold-line)/0.05)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3"><CircleHelp className="mt-0.5 h-5 w-5 shrink-0 text-[rgb(var(--gold-ink))]" aria-hidden="true" /><p className="text-sm leading-relaxed">{zh ? `仍有 ${c.pending} 款鞋待核实，未计入核实通过。` : `${c.pending} shoes still need verification and are not counted as verified.`}</p></div>
        <button type="button" onClick={showPending} className={`inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-lg text-sm font-semibold sm:self-auto ${focusClass}`}>{zh ? "查看待核实项" : "Review open items"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
      </aside> : null}

      <section ref={recordsRef} className="mt-10 scroll-mt-28 md:mt-12" aria-labelledby="report-records-title">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="t-eyebrow">{zh ? "逐鞋记录" : "SHOE BY SHOE"}</p><h2 id="report-records-title" ref={titleRef} tabIndex={-1} className="mt-2 text-2xl font-semibold tracking-[-0.025em] outline-none">{zh ? "这次改了什么" : "Inside this update"}</h2></div>
          <div className="relative w-full sm:max-w-64"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 soft-text" aria-hidden="true" /><label className="sr-only" htmlFor="report-shoe-search">{zh ? "按鞋名或品牌搜索" : "Search shoes or brands"}</label><input id="report-shoe-search" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={zh ? "搜索鞋名或品牌" : "Search shoes or brands"} className={`h-11 w-full rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.8)] bg-[rgb(var(--bg-elev)/0.8)] pl-10 pr-3 text-sm ${focusClass}`} /></div>
        </div>
        <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label={zh ? "按维护结果筛选" : "Filter by maintenance result"}>
          {(["all", ...KINDS] as Filter[]).map((kind) => {
            const count = kind === "all" ? report.entries.length : report.entries.filter((entry) => entry.kind === kind).length;
            const active = filter === kind;
            return <button key={kind} type="button" aria-pressed={active} onClick={() => chooseFilter(kind)} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-medium transition-colors ${focusClass} ${active ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] text-[rgb(var(--bg))]" : "border-[rgb(var(--glass-stroke-soft)/0.65)] hover:border-[rgb(var(--text)/0.45)]"}`}><span>{kind === "all" ? (zh ? "全部" : "All") : KIND_LABELS[kind][locale]}</span><span className="num-display opacity-70">{count}</span></button>;
          })}
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs soft-text"><p>{zh ? "点击鞋款，展开完整改动与来源。" : "Select a shoe to read its changes and sources."}</p><p role="status" aria-live="polite" aria-atomic="true">{matching.length ? (zh ? `${filterLabel} · ${start + 1}–${start + shown.length} / ${matching.length}` : `${filterLabel} · ${start + 1}–${start + shown.length} of ${matching.length}`) : (zh ? "没有匹配的记录" : "No matching records")}</p></div>
        {shown.length > 0 ? <ul className="mt-4 space-y-3" key={`${filter}-${query}-${currentPage}`}>{shown.map((entry) => <ShoeEntry key={entry.slug ?? `${entry.brand}:${entry.name}`} entry={entry} locale={locale} />)}</ul> : <div className="mt-4 rounded-2xl border border-dashed border-[rgb(var(--glass-stroke-soft)/0.7)] px-6 py-12 text-center"><h3 className="font-medium">{zh ? "这里还没有记录" : "No records in this view"}</h3><p className="mt-2 text-sm soft-text">{search ? (zh ? "试试其他鞋名或品牌，或清空搜索。" : "Try another shoe or brand, or clear your search.") : (zh ? "本次维护没有这一类别的结果。" : "This run has no results in this category.")}</p>{search ? <button type="button" onClick={() => { setQuery(""); setPage(1); }} className={`mt-3 min-h-11 rounded-lg px-4 text-sm font-medium underline underline-offset-4 ${focusClass}`}>{zh ? "清空搜索" : "Clear search"}</button> : null}</div>}
        {pageCount > 1 ? <nav className="mt-6 flex items-center justify-between gap-3" aria-label={zh ? "鞋款记录分页" : "Shoe record pages"}>
          <button type="button" onClick={() => changePage(currentPage - 1)} disabled={currentPage === 1} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-35 ${focusClass}`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />{zh ? "上一页" : "Previous"}</button>
          <p className="num-display text-xs soft-text">{currentPage} / {pageCount}</p>
          <button type="button" onClick={() => changePage(currentPage + 1)} disabled={currentPage === pageCount} className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm disabled:cursor-not-allowed disabled:opacity-35 ${focusClass}`}>{zh ? "下一页" : "Next"}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
        </nav> : null}
      </section>

      <section className="mt-12 border-t border-[rgb(var(--glass-stroke-soft)/0.65)] pt-7" aria-label={zh ? "维护说明" : "About this maintenance run"}>
        <details className="group/scope">
          <summary className={disclosureClass}><span>{zh ? "验证范围与限制" : "Verification scope & limitations"}</span><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/scope:rotate-180" aria-hidden="true" /></summary>
          <div className="pb-5 pt-4"><ul className="grid gap-3 sm:grid-cols-2">{[[zh ? "数据库写后读回" : "Database readback", report.verification.databaseReadback], [zh ? "访客身份读取" : "Anonymous readback", report.verification.anonymousReadback], [zh ? "公开页面内容" : "Public page content", report.verification.publicBody], [zh ? "截图与视觉检查" : "Screenshots & visual inspection", report.verification.visualScreenshot]].map(([label, passed]) => <li key={String(label)} className="flex items-center justify-between gap-3 rounded-xl bg-[rgb(var(--surface))] px-4 py-3 text-sm"><span>{label}</span><span className="flex shrink-0 items-center gap-1.5 text-xs soft-text">{passed ? <Check className="h-4 w-4" aria-hidden="true" /> : <CircleHelp className="h-4 w-4" aria-hidden="true" />}{passed ? (zh ? "已完成" : "Completed") : (zh ? "未确认" : "Unconfirmed")}</span></li>)}</ul>{report.verification.limitations.length > 0 ? <ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-[1.8] soft-text">{report.verification.limitations.map((note, index) => <li key={index} className="whitespace-pre-line [overflow-wrap:anywhere]">{note[locale]}</li>)}</ul> : null}</div>
        </details>
        {report.notes.length > 0 ? <details className="group/notes border-t border-[rgb(var(--glass-stroke-soft)/0.4)]"><summary className={disclosureClass}><span>{zh ? "本次维护补充说明" : "Additional maintenance notes"}<span className="num-display ml-3 text-xs soft-text">{report.notes.length}</span></span><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/notes:rotate-180" aria-hidden="true" /></summary><ol className="list-decimal space-y-4 pb-5 pl-5 pt-4 text-sm leading-[1.85] soft-text">{report.notes.map((note, index) => <li key={index} className="whitespace-pre-line [overflow-wrap:anywhere]">{note[locale]}</li>)}</ol></details> : null}
      </section>
    </article>
  </main>;
}

function ShoeEntry({ entry, locale }: { entry: CatalogueUpdateEntry; locale: "en" | "zh" }) {
  const zh = locale === "zh";
  const unresolved = entry.kind === "pending" || entry.kind === "candidate";
  return <li className="min-w-0" data-shoe-entry={entry.slug ?? entry.name}>
    <details className="group/shoe overflow-hidden rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.65)] bg-[rgb(var(--bg-elev)/0.8)] open:border-[rgb(var(--text)/0.35)]">
      <summary className={`flex min-h-24 cursor-pointer list-none items-start gap-4 p-5 [&::-webkit-details-marker]:hidden ${focusClass}`}>
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><h3 className="text-base font-semibold tracking-[-0.01em] sm:text-lg">{entry.name}</h3><span className={`text-xs ${unresolved ? "font-medium text-[rgb(var(--gold-ink))]" : "soft-text"}`}>{KIND_LABELS[entry.kind][locale]}</span></div><p className="mt-2 line-clamp-2 text-sm leading-6 soft-text group-open/shoe:hidden">{entry.summary[locale]}</p><p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] soft-text">{entry.brand ? <span>{entry.brand}</span> : null}<span>{zh ? `${entry.changes.length} 项改动` : `${entry.changes.length} changes`}</span><span>{zh ? `${entry.sources.length} 个来源链接` : `${entry.sources.length} source links`}</span></p></div>
        <ChevronDown className="mt-1 h-5 w-5 shrink-0 transition-transform group-open/shoe:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-[rgb(var(--glass-stroke-soft)/0.4)] px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
        <p className="whitespace-pre-line text-sm leading-[1.85] soft-text [overflow-wrap:anywhere]">{entry.summary[locale]}</p>
        {entry.slug ? <Link href={`/shoes/${entry.slug}` as Route} className={`mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium underline-offset-4 hover:underline ${focusClass}`}>{zh ? "查看鞋款资料" : "View shoe profile"}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /></Link> : null}
        {entry.changes.length > 0 ? <section className="mt-5" aria-label={zh ? "逐项改动" : "Field-by-field changes"}><h4 className="text-sm font-semibold">{zh ? "逐项改动" : "What changed"}</h4><dl className="mt-3 space-y-5">{entry.changes.map((change, index) => <div key={`${change.field}-${index}`}><dt className="mb-2 text-xs font-medium soft-text">{change.label[locale]}</dt><dd className="grid overflow-hidden rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.45)] text-sm leading-[1.8] sm:grid-cols-2"><div className="bg-[rgb(var(--surface))] p-4"><span className="mb-2 block text-xs font-medium soft-text">{zh ? "修改前" : "Before"}</span><p className="whitespace-pre-line soft-text [overflow-wrap:anywhere]">{change.before?.[locale] ?? (zh ? "未记录" : "Not recorded")}</p></div><div className="border-t border-[rgb(var(--glass-stroke-soft)/0.45)] p-4 sm:border-l sm:border-t-0"><span className="mb-2 block text-xs font-medium soft-text">{zh ? "修改后" : "After"}</span><p className="whitespace-pre-line [overflow-wrap:anywhere]">{change.after?.[locale] ?? (zh ? "未记录" : "Not recorded")}</p></div></dd></div>)}</dl></section> : null}
        <details className="group/sources mt-6 border-t border-[rgb(var(--glass-stroke-soft)/0.5)] pt-2"><summary className={disclosureClass}><span>{zh ? "证据与来源" : "Evidence & sources"}<span className="num-display ml-2 text-xs soft-text">{entry.sources.length}</span></span><ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open/sources:rotate-180" aria-hidden="true" /></summary>
          {entry.sources.length > 0 ? <ol className="mt-2 divide-y divide-[rgb(var(--glass-stroke-soft)/0.35)]">{entry.sources.map((source, index) => {
            const supported = [...new Set(source.supports.map((key) => FIELD_LABELS[key.replace(/_zh$/, "")]?.[locale] ?? key))];
            return <li key={`${source.url}-${index}`} className="py-4 text-sm leading-[1.8]"><div className="flex items-start gap-3"><span className="num-display mt-0.5 text-xs soft-text">{String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><a href={source.url} target="_blank" rel="noopener noreferrer" className={`inline-flex items-start gap-1.5 rounded font-medium underline decoration-[rgb(var(--text)/0.25)] underline-offset-4 hover:decoration-current [overflow-wrap:anywhere] ${focusClass}`}>{source.publisher}<ArrowUpRight className="mt-1.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /></a><p className="mt-2 text-xs soft-text">{zh ? "读取于 " : "Read "}{calendarDate(source.readDate, locale)}</p>{supported.length > 0 ? <p className="mt-1 text-xs leading-relaxed soft-text [overflow-wrap:anywhere]">{zh ? "支持内容：" : "Covers: "}{supported.join(zh ? "、" : ", ")}</p> : null}{source.note ? <p className="mt-2 whitespace-pre-line soft-text [overflow-wrap:anywhere]">{source.note[locale]}</p> : null}</div></div></li>;
          })}</ol> : <p className="py-4 text-sm leading-relaxed soft-text">{zh ? "本次尚未取得可列出的证据来源；该项未标为核实通过。" : "No source evidence is recorded for this attempt; this entry is not marked verified."}</p>}
        </details>
      </div>
    </details>
  </li>;
}
