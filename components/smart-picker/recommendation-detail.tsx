"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronDown, ExternalLink } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { Reveal } from "@/components/motion/reveal";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { PerformanceRadar } from "@/components/detail/performance-radar";
import type { RecommendationItem } from "@/lib/ai/types";
import styles from "./recommendation-detail.module.css";

type Props = {
  rec: RecommendationItem;
  onBack: () => void;
};

/** The shortlist's inline detail surface. Navigation and scrolling belong to its host. */
export function RecommendationDetail({ rec, onBack }: Props) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const backRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { backRef.current?.focus({ preventScroll: true }); }, []);
  const headingId = useId();
  const reasonId = useId();
  const [reasonExpanded, setReasonExpanded] = useState(false);
  const missing = zh ? "未收录" : "Not recorded";
  const recorded = (value: string | number | null | undefined) => {
    const text = value == null ? "" : String(value).trim();
    return text || missing;
  };
  const facts = [
    { label: zh ? "发布年份" : "Release year", value: recorded(rec.release_year) },
    { label: zh ? "重量" : "Weight", value: recorded(rec.weight) },
    { label: zh ? "类别" : "Category", value: recorded(rec.category) },
    { label: zh ? "签名球员" : "Signature player", value: recorded(rec.player) }
  ];
  const technologies = [
    { label: zh ? "前掌中底" : "Forefoot cushioning", value: recorded(rec.tech?.forefoot) },
    { label: zh ? "后掌中底" : "Heel cushioning", value: recorded(rec.tech?.heel) },
    { label: zh ? "鞋面" : "Upper", value: recorded(rec.tech?.upper) },
    { label: zh ? "外底" : "Outsole", value: recorded(rec.tech?.outsole) }
  ];
  const reason = rec.reason?.trim() ?? "";
  const canExpandReason = reason.length > 140;
  const references = rec.references ?? [];

  return (
    <article className={styles.detail} aria-labelledby={headingId} data-picker-shoe-detail={rec.shoe_id}>
      <button ref={backRef} type="button" className={styles.back} onClick={onBack} aria-label={zh ? "返回推荐列表" : "Back to recommendations"}>
        <ChevronLeft size={17} aria-hidden="true" />
        {zh ? "返回" : "Back"}
      </button>

      <div className={styles.hero}>
        <div className={styles.imageStage}>
          <ShoeImage src={rec.image_url} alt={rec.shoe_name} fallbackLabel={zh ? "暂无图片" : "No image"}
            variant="detail" stage={false} priority className={styles.image} />
        </div>
        <div className={styles.identity}>
          <p className={styles.brand}>{recorded(rec.brand)}</p>
          <h2 id={headingId} className={styles.title}>{rec.shoe_name}</h2>
          <dl className={styles.facts}>
            {facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
          </dl>
        </div>
      </div>

      {reason && <section className={styles.reasonSection}>
        <h3 className={styles.sectionTitle}>{zh ? "为什么推荐" : "Why this pick"}</h3>
        <p id={reasonId} className={styles.reason} data-collapsed={canExpandReason && !reasonExpanded}>{reason}</p>
        {canExpandReason && <button type="button" className={styles.reasonToggle} aria-expanded={reasonExpanded} aria-controls={reasonId}
          onClick={() => setReasonExpanded(value => !value)}>
          {reasonExpanded ? (zh ? "收起" : "Show less") : (zh ? "完整理由" : "Full reasoning")}
          <ChevronDown size={13} className={styles.chevron} data-open={reasonExpanded} aria-hidden="true" />
        </button>}
      </section>}

      <div className={styles.specifications}>
        <section className={styles.performance}>
          <h3 className={styles.sectionTitle}>{zh ? "性能概览" : "Performance"}</h3>
          {rec.radar?.length ? <Reveal className={styles.radar}><PerformanceRadar axes={rec.radar} /></Reveal>
            : <p className={styles.empty}>{missing}</p>}
        </section>
        <section className={styles.technology}>
          <h3 className={styles.sectionTitle}>{zh ? "基本配置" : "Construction"}</h3>
          <Stagger as="ul" className={styles.techList} gap={0.04}>
            {technologies.map(technology => <StaggerItem as="li" key={technology.label}><dl><dt>{technology.label}</dt><dd>{technology.value}</dd></dl></StaggerItem>)}
          </Stagger>
        </section>
      </div>

      {references.length > 0 && <details className={styles.sources}>
        <summary>
          <span>{zh ? "参考来源" : "Sources"}<span className={styles.sourceCount}> {references.length}</span></span>
          <ChevronDown size={14} className={styles.chevron} aria-hidden="true" />
        </summary>
        <ol>
          {references.map((reference, index) => <li key={`${reference.url}-${index}`}>
            <a href={reference.url} target="_blank" rel="noopener noreferrer">
              <span>{reference.title || reference.url}</span><ExternalLink size={12} aria-hidden="true" />
            </a>
          </li>)}
        </ol>
      </details>}
    </article>
  );
}
