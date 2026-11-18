"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import type { PickerExportProps } from "./recommendation-report-card";
import { PickerExportFrame, PickImage, PickRating } from "./picker-export-frame";
import styles from "./picker-export.module.css";

function excerpt(value: string, limit: number) {
  const text = value.replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > limit ? `${chars.slice(0, limit).join("").trimEnd()}…` : text;
}

/** A concise companion to the full report, with the same recommendation order. */
export function RecommendationShareCard({ requestText, recommendations }: PickerExportProps) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const [first, ...rest] = recommendations.slice(0, 4);
  return <PickerExportFrame compact>
    <p className={styles.eyebrow}>{zh ? "为我的打法而选" : "Selected for my game"}</p>
    <h1 className={`${styles.title} ${styles.shareTitle}`}>{zh ? "我的下一双。" : "My next pair."}</h1>
    {requestText.trim() && <p className={styles.shareRequest}>{excerpt(requestText, zh ? 82 : 170)}</p>}
    {first && <section className={styles.hero}>
      <div className={styles.court} aria-hidden="true" />
      <div className={styles.heroTop}><span className={styles.eyebrow}>{zh ? "首选推荐 / 01" : "First pick / 01"}</span><PickRating value={first.stars} /></div>
      <div className={styles.heroImage}><PickImage src={first.image_url} /></div>
      <p className={styles.eyebrow}>{first.brand}</p><h2 className={styles.heroName}>{first.shoe_name}</h2>
      {first.reason && <p className={styles.heroReason}>{excerpt(first.reason, zh ? 95 : 200)}</p>}
    </section>}
    <div className={styles.runners}>{rest.map((rec, i) => <section className={styles.runner} key={rec.shoe_id}>
      <span className={styles.rank}>{String(i + 2).padStart(2, "0")}</span><PickImage src={rec.image_url} />
      <div><p className={styles.eyebrow}>{rec.brand}</p><h3>{rec.shoe_name}</h3></div><PickRating value={rec.stars} />
    </section>)}</div>
    <p className={styles.note}>{zh ? "评分为本次推荐评分 · 完整分析见选鞋报告" : "Recommendation ratings · Full reasoning in your report"}{recommendations.length > 4 ? (zh ? ` · 展示 ${recommendations.length} 双中的前 4 双` : ` · First 4 of ${recommendations.length} picks`) : ""}</p>
  </PickerExportFrame>;
}
