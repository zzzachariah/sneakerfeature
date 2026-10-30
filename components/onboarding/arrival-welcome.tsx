"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import type { OnboardingPageviews } from "@/lib/onboarding/server-contract";
import { EASE } from "@/lib/motion/constants";
import { AnimatedCount, CountReveal } from "./animated-count";
import { ScrollHint } from "./scroll-hint";
import styles from "./arrival-welcome.module.css";

export type ArrivalWelcomeProps = {
  zh: boolean;
  memberNumber: number | null;
  username: string | null;
  pageviews: OnboardingPageviews | undefined;
  stale: boolean;
  onEnter: () => void;
  busy: boolean;
  error?: string;
};

function validCount(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function formattedDate(value: string | null | undefined, zh: boolean, range = false): string | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  return new Intl.DateTimeFormat(zh ? "zh-CN" : "en-GB", range
    ? { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }
    : { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }
  ).format(new Date(value));
}

/** The final invitation after the account and required profile are confirmed. */
export function ArrivalWelcome({ zh, memberNumber, username, pageviews, stale, onEnter, busy, error }: ArrivalWelcomeProps) {
  const reduced = useReducedMotion();
  const id = useId();
  const [sourceOpen, setSourceOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const t = (cn: string, en: string) => zh ? cn : en;
  const number = validCount(memberNumber) && memberNumber > 0 ? memberNumber : null;
  const views = validCount(pageviews?.total) && pageviews?.status !== "unavailable" ? pageviews.total : null;
  const outdated = stale || pageviews?.status === "stale" || pageviews?.status === "snapshot" || Boolean(pageviews?.snapshot);
  const since = formattedDate(pageviews?.since, zh, true);
  const through = formattedDate(pageviews?.rangeThrough, zh, true);
  const updated = formattedDate(pageviews?.asOf, zh);
  const name = username?.trim() || t("新球员", "New player");
  const countStyle = {
    "--arrival-number-length": Math.max(4, String(number ?? 0).length),
    "--arrival-view-length": Math.max(6, views === null ? 6 : views.toLocaleString("en-US").length)
  } as CSSProperties;

  useEffect(() => {
    const frame = requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!error) return;
    const frame = requestAnimationFrame(() => {
      const panel = scroll.current;
      const message = feedback.current;
      if (!panel || !message) return;
      const panelBounds = panel.getBoundingClientRect();
      const messageBounds = message.getBoundingClientRect();
      if (messageBounds.top < panelBounds.top || messageBounds.bottom > panelBounds.bottom - 24) {
        panel.scrollTop += messageBounds.top - panelBounds.top - 12;
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [error]);

  return <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? .15 : .85, ease: EASE }} className={styles.root} style={countStyle} lang={zh ? "zh" : "en"} aria-labelledby={`${id}-title`} aria-busy={busy} data-arrival-welcome>
    <div ref={scroll} className={styles.scroll} role="region" tabIndex={0} aria-label={t("欢迎与球员信息，可滚动", "Welcome and player details, scrollable")}>
      <div className={styles.content}>
        <header className={styles.heading}>
          <p className={styles.eyebrow}>{t("欢迎来到你的下一场探索", "Your next discovery starts here")}</p>
          <h1 ref={heading} tabIndex={-1} id={`${id}-title`} className={styles.title}>{zh ? <>你的到来，<br/>让探索继续。</> : <>The game is better<br/>with you in it.</>}</h1>
          <p className={styles.introduction}>{t("感谢你成为其中一员。属于你的球鞋探索，现在开始。", "Thanks for being part of snkrfeature. Make the next discovery your own.")}</p>
        </header>

        <CountReveal runKey={`arrival-${number ?? "pending"}`}>
          <motion.div className={styles.invitation} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? .15 : .95, ease: EASE }} data-arrival-player>
            <svg className={styles.court} viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
              <motion.path d="M25 280V20H575V280M300 20V280M235 280V194H365V280M247 194a53 53 0 1 1 106 0M130 280a170 170 0 0 1 340 0" fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" initial={{ pathLength: reduced ? 1 : 0 }} animate={{ pathLength: 1 }} transition={{ duration: reduced ? 0 : 1.6, ease: EASE }} />
              <circle cx="300" cy="262" r="7" fill="none" stroke="currentColor" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
            </svg>
            <div className={styles.passTop}><span className={styles.playerIntroduction}>{zh ? <>你是 <span className={styles.wordmark}>snkrfeature</span> 的</> : <><span className={styles.wordmark}>snkrfeature</span> player</>}</span><span className={styles.passType}>PLAYER ENTRY</span></div>
            <div className={styles.playerNumber}>
              {number !== null ? <><span className={styles.numberUnit}>{zh ? "第" : "No."}</span><AnimatedCount value={number}/>{zh ? <span className={styles.numberUnit}>位球员</span> : null}</> : <span className={styles.pending}>{t("正在确认你的球员编号", "Confirming your player number")}</span>}
            </div>
            <p className={styles.numberLabel}>{t("你的固定球员编号", "Your permanent player number")}</p>
            <div className={styles.signature}>
              <div><strong className={styles.name}>{name}</strong></div>
              <span className={styles.entryMark} aria-hidden="true"><span/><span/><span/></span>
            </div>
          </motion.div>

          <div className={styles.community} data-arrival-pageviews data-status={views === null ? "unavailable" : outdated ? "stale" : "live"}>
            {views !== null ? <p className={styles.views}>
              <span className={styles.viewsLabel}>{t("全站累计", "Across snkrfeature")}</span>
              <strong className={styles.viewsCount}><AnimatedCount value={views}/></strong>
              <span className={styles.viewsLabel}>{t("次浏览", "page views")}</span>
            </p> : <p className={styles.unavailable}>{t("全站累计浏览量暂不可用", "Lifetime page views are temporarily unavailable")}</p>}
            <div className={styles.provenance}>
              <p className={styles.source}>Vercel <span aria-hidden="true">·</span> {updated && views !== null ? <>{outdated ? t("上次核实 ", "Last confirmed ") : t("更新于 ", "Updated ")}<time dateTime={pageviews?.asOf ?? undefined}>{updated}</time></> : views !== null ? t("更新时间暂不可用", "Update time unavailable") : t("浏览统计暂不可用", "Page view data unavailable")}</p>
              {views !== null && outdated ? <p className={styles.dataNotice} role="status">{t("暂时无法更新，保留上次确认的数据。", "Updates are unavailable. Showing the last confirmed total.")}</p> : null}
              {views === null ? <p className={styles.dataNotice}>{t("不影响你的球鞋探索，准备好就出发。", "Your shoe discovery can begin whenever you’re ready.")}</p> : null}
              <div className={styles.sourceDetails}>
                <button className={styles.sourceToggle} type="button" aria-expanded={sourceOpen} aria-controls={`${id}-source`} onClick={() => setSourceOpen(open => !open)}>{t("数据来源", "About these figures")}<motion.span animate={{ rotate: sourceOpen ? 180 : 0 }} transition={{ duration: reduced ? 0 : .24 }}><ChevronDown size={12}/></motion.span></button>
                <AnimatePresence initial={false}>{sourceOpen ? <motion.div key="source" id={`${id}-source`} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? .12 : .3, ease: EASE }} style={{ overflow: "hidden" }}><div className={styles.sourceExplanation}>
                  <p>Vercel Web Analytics <span aria-hidden="true">·</span> {t("全站历史浏览总量", "Lifetime website page views")}</p>
                  {since && through ? <p>{t("统计范围（UTC）", "Reported range (UTC)")} <time dateTime={pageviews?.since ?? undefined}>{since}</time><span aria-hidden="true"> — </span><time dateTime={pageviews?.rangeThrough ?? undefined}>{through}</time></p>
                    : since ? <p>{t("统计起点（UTC）", "Recorded since (UTC)")} <time dateTime={pageviews?.since ?? undefined}>{since}</time></p>
                    : through ? <p>{t("统计截至（UTC）", "Reported through (UTC)")} <time dateTime={pageviews?.rangeThrough ?? undefined}>{through}</time></p>
                    : <p>{t("统计范围暂不可用", "The reporting range is unavailable")}</p>}
                  <p>{t("浏览总量与球员编号分别记录，不表示你的个人浏览次数或历史注册排名。", "Page views and player numbers are separate records, not your personal view count or a historical registration rank.")}</p>
                </div></motion.div> : null}</AnimatePresence>
              </div>
            </div>
          </div>
        </CountReveal>

        {error ? <div ref={feedback} className={styles.error} role="alert"><AlertCircle size={16} aria-hidden="true"/><span>{error}</span></div> : null}
      </div>
      <ScrollHint targetRef={scroll} zh={zh}/>
    </div>
    <div className={styles.actions}>
      <motion.button type="button" className={styles.enter} disabled={busy} onClick={() => { if (!busy) onEnter(); }} whileTap={reduced ? undefined : { scale: .985 }} transition={{ duration: .12 }}>
        <span>{busy ? t("正在进入球鞋世界…", "Opening your shoe world…") : t("开始球鞋探索", "Start exploring shoes")}</span>
        {busy ? <Loader2 className={styles.spinner} size={18} aria-hidden="true"/> : <ArrowRight size={18} aria-hidden="true"/>}
      </motion.button>
    </div>
  </motion.section>;
}
