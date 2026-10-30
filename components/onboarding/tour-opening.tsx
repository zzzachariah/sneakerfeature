"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { EASE } from "@/lib/motion/constants";
import { AnimatedCount, CountReveal } from "./animated-count";
import { BrandLogo } from "./site-stories";
import { ScrollHint } from "./scroll-hint";
import styles from "./tour-opening.module.css";

type TourOpeningProps = {
  zh: boolean;
  shoes: number | null;
  brands: number | null;
  loading: boolean;
  stale: boolean;
  onStart: () => void;
  onLanguageChange: (locale: "zh" | "en") => void;
};

function confirmedCount(value: number | null) {
  return value !== null && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** The brand opening owns only its available shell space, never the viewport. */
export function TourOpening({ zh, shoes, brands, loading, stale, onStart, onLanguageChange }: TourOpeningProps) {
  const reduced = useReducedMotion();
  const [beat, setBeat] = useState(0);
  useEffect(() => {
    if (reduced) { setBeat(5); return; }
    const timers = [450, 1350, 2050, 2850, 4200].map((at, index) => window.setTimeout(() => setBeat(index + 1), at));
    return () => timers.forEach(window.clearTimeout);
  }, [reduced]);
  const reveal = (stage: number) => ({
    initial: false as const,
    animate: { opacity: reduced || beat >= stage ? 1 : 0, y: reduced || beat >= stage ? 0 : 10 },
    transition: { duration: reduced ? 0 : 1, ease: EASE }
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const shoeCount = confirmedCount(shoes);
  const brandCount = confirmedCount(brands);
  const ready = shoeCount !== null && brandCount !== null;
  const notice = loading && !ready
    ? (zh ? "正在读取球鞋与品牌资料…" : "Loading our shoes and brands…")
    : stale && (shoeCount !== null || brandCount !== null)
      ? (zh ? "显示上次确认的统计。" : "Showing the last confirmed figures.")
      : !ready && !loading
        ? (zh ? "部分统计暂不可用，仍可开始介绍。" : "Some figures are unavailable. You can still start the tour.")
        : "";

  return <motion.section className={styles.opening} data-testid="onboarding-tour-opening" aria-labelledby={titleId} lang={zh ? "zh" : "en"}
    initial={false}
    animate={{ opacity: 1, y: 0 }}
    exit={reduced ? { opacity: 0, transition: { duration: .15 } } : { opacity: 0, y: -10, transition: { duration: .34, ease: EASE } }}
    transition={{ duration: reduced ? .15 : .62, ease: EASE }}>
    <div ref={scrollRef} className={styles.scroll} role="region" tabIndex={0} aria-label={zh ? "欢迎来到 snkrfeature" : "Welcome to snkrfeature"}>
      <div className={styles.content}>
        <div className={styles.identity}>
          <motion.div {...reveal(1)} className={styles.emblem} data-opening-beat="logo" aria-hidden="true"><BrandLogo compact shared={false}/></motion.div>
          <motion.h1 {...reveal(2)} className={styles.wordmark} data-opening-beat="name" id={titleId} tabIndex={-1}>snkrfeature</motion.h1>
          <motion.p {...reveal(3)} className={styles.tagline} data-opening-beat="tagline">{zh ? "为你的打法，找到下一双。" : "Your game. Your next pair."}</motion.p>
        </div>

        <motion.div {...reveal(4)} className={styles.community} data-opening-counts data-opening-beat="counts">
          <CountReveal active={Boolean(reduced) || beat >= 4} runKey={ready ? "opening-counts-ready" : "opening-counts-pending"}>
            <dl className={styles.figures}>
              <div className={styles.figure}>
                <dt>{zh ? "款球鞋" : "shoes to explore"}</dt>
                <dd>{shoeCount !== null ? <AnimatedCount value={shoeCount}/> : <span aria-label={zh ? "球鞋数量暂不可用" : "Shoe count unavailable"}>—</span>}</dd>
              </div>
              <div className={styles.figure}>
                <dt>{zh ? "个球鞋品牌" : "shoe brands"}</dt>
                <dd>{brandCount !== null ? <AnimatedCount value={brandCount}/> : <span aria-label={zh ? "品牌数暂不可用" : "Brand count unavailable"}>—</span>}</dd>
              </div>
            </dl>
          </CountReveal>
          {notice ? <p className={styles.notice} role="status" aria-live="polite">{notice}</p> : null}
        </motion.div>

      </div>
      <ScrollHint targetRef={scrollRef} zh={zh}/>
    </div>
    <motion.div {...reveal(5)} className={styles.actions} inert={!reduced && beat < 5} aria-hidden={!reduced && beat < 5} data-opening-beat="actions">
      <div className={styles.languages} role="group" aria-label={zh ? "选择语言" : "Choose your language"}>
          <button type="button" lang="zh" aria-pressed={zh} onClick={() => onLanguageChange("zh")}>中文</button>
          <button type="button" lang="en" aria-pressed={!zh} onClick={() => onLanguageChange("en")}>English</button>
      </div>
      <motion.button className={styles.start} type="button" onClick={onStart}
          whileTap={reduced ? undefined : { scale: .98 }}
          transition={{ duration: .16, ease: EASE }}>
          <span>{zh ? "开始 Site Tour" : "Start Site Tour"}</span><ArrowRight size={17} aria-hidden="true"/>
      </motion.button>
    </motion.div>
  </motion.section>;
}
