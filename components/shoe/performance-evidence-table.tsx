"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { hasPerformanceEvidence, DIM_KEYS, DIM_LABELS, dimScores } from "@/lib/star-rating";
import type { Shoe } from "@/lib/types";

export function hasCompletePerformance(shoe: Shoe): boolean {
  return DIM_KEYS.every(k => hasPerformanceEvidence(shoe.spec?.[k]));
}

export function PerformanceEvidenceTable({ axes }: { axes: {label:string; rawText?:string|null; score:number}[] }) {
  const { translate, locale } = useLocale();
  return <div className="space-y-3 rounded-2xl border border-[rgb(var(--muted)/0.4)] p-4">
    <p className="text-sm soft-text">{locale === "zh" ? "资料尚不完整，缺失项目暂不评分。" : "Some evidence is missing. Unavailable dimensions are not scored."}</p>
    <dl className="grid gap-2 text-sm">
      {axes.map(axis => <div key={axis.label} className="flex justify-between gap-4">
        <dt>{translate(axis.label)}</dt>
        <dd className="font-medium">{hasPerformanceEvidence(axis.rawText) ? `${Math.round(axis.score)} / 100` : (locale === "zh" ? "资料不足" : "Not enough data")}</dd>
      </div>)}
    </dl>
  </div>;
}

export function ComparisonEvidenceTable({ shoes }: {shoes:Shoe[]}) {
  return <div className="grid gap-4 sm:grid-cols-2">{shoes.map(shoe => {
    const scores=dimScores(shoe.spec);
    return <section key={shoe.id} className="min-w-0 space-y-2">
      <h3 className="text-sm font-semibold">{shoe.shoe_name}</h3>
      <PerformanceEvidenceTable axes={DIM_KEYS.map(k => ({label:DIM_LABELS[k],rawText:shoe.spec?.[k],score:scores[k]}))} />
    </section>;
  })}</div>;
}
