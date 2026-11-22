"use client";

import { hasPerformanceEvidence } from "@/lib/star-rating";
import { getLineStyle } from "@/components/compare/compare-metrics";
import { useLocale } from "@/components/i18n/locale-provider";
import type { RecommendationItem } from "@/lib/ai/types";
import { PickerExportFrame, PickImage, PickRating, PICK_COLORS, summaryMarkup } from "./picker-export-frame";
import styles from "./picker-export.module.css";

function ReportRadar({ recs }: { recs: RecommendationItem[] }) {
  const { translate, locale } = useLocale();
  const axes = recs[0]?.radar ?? [];
  // Missing or differently ordered axes must never become fabricated zero scores.
  const complete = axes.length >= 3 && recs.every(rec => rec.radar.length === axes.length && axes.every((axis, i) =>
    rec.radar[i].label === axis.label && hasPerformanceEvidence(rec.radar[i].rawText) && Number.isFinite(rec.radar[i].score)));
  if (!complete) return <p className={styles.note}>{translate("Not enough data for an overall verdict")}</p>;
  const angles = axes.map((_, i) => (-90 + i * 360 / axes.length) * Math.PI / 180);
  const point = (a: number, r: number) => [210 + r * Math.cos(a), 190 + r * Math.sin(a)];
  const points = (values: number[]) => angles.map((a, i) => point(a, values[i]).join(",")).join(" ");
  return <svg viewBox="0 0 420 380" width={420} height={380} role="img" aria-label={locale === "zh" ? "推荐鞋款性能对比" : "Recommended shoe performance comparison"}>
    {[0.25, 0.5, 0.75, 1].map(r => <polygon key={r} points={points(axes.map(() => r * 120))} fill="none" stroke="#d7e2e9" />)}
    {angles.map((a, i) => { const [x, y] = point(a, 120); return <line key={i} x1={210} y1={190} x2={x} y2={y} stroke="#d7e2e9" />; })}
    {recs.map((rec, i) => <polygon key={rec.shoe_id} points={points(rec.radar.map(axis => Math.max(0, Math.min(100, axis.score)) * 1.2))}
      fill={PICK_COLORS[i]} fillOpacity={0.055} stroke={PICK_COLORS[i]} strokeWidth={2.5} strokeDasharray={getLineStyle(i).dashArray} strokeLinejoin="round" />)}
    {angles.map((a, i) => { const [x, y] = point(a, 153); return <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={600} fill="#566b7a">{translate(axes[i].label)}</text>; })}
  </svg>;
}

export type PickerExportProps = { requestText: string; summary?: string; recommendations: RecommendationItem[] };

export function RecommendationReportCard({ requestText, summary, recommendations }: PickerExportProps) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  // Limit only the overlay chart; the full report always includes every pick.
  const chartPicks = recommendations.slice(0, 4);
  return <PickerExportFrame>
    <p className={styles.eyebrow}>{zh ? `${recommendations.length} 双推荐 · 为你的打法而选` : `${recommendations.length} picks · Selected for your game`}</p>
    <h1 className={styles.title}>{zh ? "你的选鞋报告" : "Your next-pair report."}</h1>
    {requestText.trim() && <section className={styles.request}><h2 className={styles.eyebrow}>{translate("Request")}</h2><p>{requestText}</p></section>}
    {summary?.trim() && <section className={styles.summary}><h2 className={styles.sectionTitle}>{zh ? "选鞋思路" : "The thinking behind your picks"}</h2><p className={styles.summaryText}>{summaryMarkup(summary)}</p></section>}
    {chartPicks.length > 0 && <section className={styles.overview}>
      <ReportRadar recs={chartPicks} />
      <div><h2 className={styles.sectionTitle}>{zh ? "性能对比 · 推荐评分" : "Performance / recommendation rating"}</h2>
        <div className={styles.legend}>{chartPicks.map((rec, i) => <div className={styles.legendRow} key={rec.shoe_id}>
          <svg width={28} height={12} aria-hidden="true"><line x1={0} x2={28} y1={6} y2={6} stroke={PICK_COLORS[i]} strokeWidth={3} strokeDasharray={getLineStyle(i).dashArray} /></svg>
          <span className={styles.legendName}>{rec.shoe_name}</span><PickRating value={rec.stars} />
        </div>)}</div>
        <p className={styles.note}>{zh ? "雷达图展示已收录的性能信息；评分为本次推荐评分。" : "Radar: recorded performance. Ratings: this recommendation."}{recommendations.length > 4 ? (zh ? " 图表展示前 4 双，完整推荐见下方。" : " Chart shows the first 4 picks; all picks follow below.") : ""}</p>
      </div>
    </section>}
    {recommendations.map((rec, i) => <section className={styles.pick} key={rec.shoe_id}>
      <div className={styles.pickHeader}>
        <div className={styles.imageStage}><PickImage src={rec.image_url} /></div>
        <div><div className={styles.pickMeta}><span className={styles.rank} style={{ color: PICK_COLORS[i % PICK_COLORS.length] }}>{zh ? "推荐" : "PICK"} {String(i + 1).padStart(2, "0")}</span><PickRating value={rec.stars} /></div>
          <p className={styles.eyebrow}>{rec.brand}</p><h2 className={styles.shoeName}>{rec.shoe_name}</h2></div>
      </div>
      {rec.reason && <p className={styles.reason}>{summaryMarkup(rec.reason)}</p>}
      <dl className={styles.tech}>{[
        [zh ? "前掌中底" : "Forefoot cushioning", rec.tech.forefoot], [zh ? "后掌中底" : "Heel cushioning", rec.tech.heel],
        [zh ? "外底" : "Outsole", rec.tech.outsole], [zh ? "鞋面" : "Upper", rec.tech.upper]
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || (zh ? "未收录" : "Not recorded")}</dd></div>)}</dl>
      {(rec.pros.length > 0 || rec.cons.length > 0) && <div className={styles.tradeoffs}>
        {rec.pros.length > 0 && <div><h3 style={{ color: "#38786d" }}>{zh ? "优势" : "What works"}</h3><ul>{rec.pros.map((pro, index) => <li key={index}>{pro}</li>)}</ul></div>}
        {rec.cons.length > 0 && <div><h3 style={{ color: "#b75730" }}>{zh ? "需要留意" : "Keep in mind"}</h3><ul>{rec.cons.map((con, index) => <li key={index}>{con}</li>)}</ul></div>}
      </div>}
      {!!rec.references?.length && <div className={styles.sources}><strong>{translate("References")}</strong><ol>{rec.references.map((ref, index) => <li key={index}>{ref.title || ref.url}</li>)}</ol></div>}
    </section>)}
  </PickerExportFrame>;
}
