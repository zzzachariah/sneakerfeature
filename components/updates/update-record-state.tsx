"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";

export function UpdateRecordState({ state }: { state: "missing" | "unavailable" }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  return <main className="container-shell py-16" data-no-translate="true"><div className="mx-auto max-w-3xl"><Link href="/updates" className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm soft-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"><ArrowLeft className="h-4 w-4" aria-hidden="true" />{zh ? "全部更新记录" : "All updates"}</Link><section className="mt-8 rounded-2xl border p-8" role="status"><h1 className="text-2xl font-semibold">{state === "missing" ? zh ? "这份维护记录尚未公开" : "This maintenance report is not available" : zh ? "维护记录暂时无法加载" : "This maintenance report could not be loaded"}</h1><p className="mt-4 text-sm leading-relaxed soft-text">{state === "missing" ? zh ? "请返回更新总览，查看已发布的维护记录。" : "Return to the archive to browse published maintenance reports." : zh ? "请稍后重新加载；完整记录仍会保留。" : "Try reloading shortly to read the complete report."}</p>{state === "unavailable" ? <button type="button" onClick={() => window.location.reload()} className="mt-6 min-h-11 rounded-xl bg-[rgb(var(--text))] px-5 text-sm font-medium text-[rgb(var(--bg))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-4">{zh ? "重新加载" : "Reload report"}</button> : null}</section></div></main>;
}
