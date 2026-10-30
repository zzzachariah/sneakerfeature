"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Info, UserRound } from "lucide-react";
import { PlaystyleDimGrid } from "@/components/preferences/playstyle-dim-grid";
import { POSITIONS, type Position } from "@/lib/persona/types";
import { type DimKey } from "@/lib/star-rating";
import { EASE } from "@/lib/motion/constants";
import { useNarrativeScroll } from "./use-narrative-scroll";
import styles from "./site-interactive-stories.module.css";
import narrative from "./story-narrative.module.css";

const names: Record<Position, [string, string]> = { PG: ["控球后卫", "Point guard"], SG: ["得分后卫", "Shooting guard"], SF: ["小前锋", "Small forward"], PF: ["大前锋", "Power forward"], C: ["中锋", "Center"] };
export function ProfileNarrative({ zh, reduced, positions, picks, onPosition, onFocus, label, pair, comparison }: {
  zh: boolean; reduced: boolean; positions: Position[]; picks: DimKey[];
  onPosition: (position: Position) => void; onFocus: (key: DimKey) => void;
  label: (key: DimKey) => string; pair: ReactNode; comparison: (key: DimKey) => ReactNode;
}) {
  const [openingBeat, setOpeningBeat] = useState(reduced ? 3 : 0);
  useEffect(() => {
    if (reduced) { setOpeningBeat(3); return; }
    const timers = [650, 1250, 2400].map((at, i) => window.setTimeout(() => setOpeningBeat(i + 1), at));
    return () => timers.forEach(window.clearTimeout);
  }, [reduced]);
  const prioritiesRef = useRef<HTMLElement>(null);
  const evidenceRef = useRef<HTMLDivElement>(null);
  const scroll = useNarrativeScroll(reduced);
  const readyPositions = positions.length === 2;
  const readyEvidence = readyPositions && picks.length === 3;
  const [index, setIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const [reading, setReading] = useState(false);
  const pickKey = picks.join(":");
  const focus = picks[Math.min(index, picks.length - 1)] ?? "traction";

  useEffect(() => {
    if (!readyPositions) return;
    void scroll(prioritiesRef.current, false, 850);
  }, [readyPositions, scroll, reduced]);
  useEffect(() => {
    setIndex(0); setManual(false); setReading(false);
    if (!readyEvidence) return;
    let disposed = false;
    void scroll(evidenceRef.current, false, 950).then(arrived => { if (!disposed) setReading(arrived); });
    return () => { disposed = true; };
  }, [readyEvidence, pickKey, reduced, scroll]);
  useEffect(() => {
    if (!reading || manual || reduced || index >= 2) return;
    const timer = window.setTimeout(() => { if (!document.hidden) setIndex(value => value + 1); }, 3600);
    const stop = () => setManual(true);
    const panel = evidenceRef.current?.closest("[data-onboarding-story-scroll]");
    panel?.addEventListener("wheel", stop, { passive: true });
    panel?.addEventListener("touchstart", stop, { passive: true });
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.clearTimeout(timer);
      panel?.removeEventListener("wheel", stop);
      panel?.removeEventListener("touchstart", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [reading, manual, reduced, index]);

  const entrance = (stage: number) => ({ initial: false as const, animate: { opacity: openingBeat >= stage ? 1 : 0, y: openingBeat >= stage ? 0 : 12 }, transition: { duration: reduced ? 0 : .85, ease: EASE } });
  return <div className={narrative.profile} data-profile-narrative data-profile-beat={openingBeat} data-profile-stage={readyEvidence ? "evidence" : readyPositions ? "priorities" : "positions"}>
    <motion.div {...entrance(1)} className={styles.profileHeading}>
      <div className={styles.profileMark}><UserRound size={23}/><span>{positions.length ? positions.join(" / ") : "YOU"}</span></div>
      <div><h3>{zh ? "先从你的打法开始。" : "Start with your game."}</h3><p>{zh ? "每个选择，都让下一步更贴近你。" : "Each choice brings the next step closer to your game."}</p></div>
    </motion.div>
    <motion.fieldset {...entrance(2)} className={styles.positionField} inert={openingBeat < 2}>
      <legend>{zh ? "你在场上的两个角色" : "Your two roles on court"}<span>{positions.length} / 2</span></legend>
      <div className={`${styles.positionGrid} ${narrative.positionCards}`}>
        {POSITIONS.map((position, i) => <motion.button key={position} type="button" aria-pressed={positions.includes(position)} onClick={() => onPosition(position)} initial={false} animate={{ opacity: openingBeat >= 2 ? 1 : 0, rotateX: openingBeat >= 2 ? 0 : -65, y: openingBeat >= 2 ? 0 : 12 }} transition={{ duration: reduced ? 0 : .85, delay: reduced || openingBeat < 2 ? 0 : i * .14, ease: EASE }}>
          <strong>{position}</strong><span>{names[position][zh ? 0 : 1]}</span>{positions.includes(position) && <Check size={12}/>}
        </motion.button>)}
      </div>
    </motion.fieldset>
    <AnimatePresence initial={false}>
      {readyPositions && <motion.section ref={prioritiesRef} key="priorities" className={`${styles.focusSection} ${narrative.priorities}`} data-profile-priorities initial={reduced ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: reduced ? 0 : .8, ease: EASE }}>
        <div className={styles.subheading}><strong>{zh ? "你最在意什么？" : "What matters most?"}</strong><span>{zh ? "依次选 3 项 · 顺序就是优先级" : "Pick three in priority order"}</span></div>
        <PlaystyleDimGrid picks={picks} onToggle={onFocus}/>
        <div className={styles.priorityOrder} aria-live="polite">{picks.length ? picks.map((key, i) => <span key={key}><b>{i + 1}</b>{label(key)}</span>) : <span>{zh ? "从你最在意的一项开始。" : "Start with what matters most to you."}</span>}</div>
      </motion.section>}
      {readyEvidence && <motion.div key="evidence" ref={evidenceRef} className={`${styles.focusPreview} ${narrative.evidence}`} data-profile-evidence initial={reduced ? false : { opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .95, ease: EASE }}>
        <div className={styles.subheading}><strong>{zh ? "现在，从你的关注点看这两双。" : "Your priorities. Your two picks."}</strong><span>{zh ? "按你选择的顺序逐项了解" : "In the order you chose"}</span></div>
        {pair}
        <div className={`${styles.dimensionTabs} ${narrative.readingTabs}`} aria-label={zh ? "你的三个优先项" : "Your three priorities"}>{picks.map((key, i) => <button key={key} type="button" aria-pressed={focus === key} onClick={() => { setManual(true); setIndex(i); }}><span>{String(i + 1).padStart(2, "0")}</span>{label(key)}</button>)}</div>
        <AnimatePresence mode="wait" initial={false}><motion.h4 key={focus} className={narrative.readingTitle} initial={reduced ? false : { opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .4 }}>{zh ? `看一看：${label(focus)}` : `A closer look: ${label(focus)}`}</motion.h4></AnimatePresence>
        {comparison(focus)}
      </motion.div>}
    </AnimatePresence>
    <motion.p {...entrance(3)} className={styles.evidenceNote}><Info size={14}/>{zh ? "这里只临时试选，不会保存。注册后再把你的位置和偏好加入正式球员档案。" : "This is a temporary preview and will not be saved. Add your positions and priorities to your player profile after signing up."}</motion.p>
  </div>;
}
