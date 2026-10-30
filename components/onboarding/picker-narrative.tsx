"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDown, ArrowUpRight, Sparkles } from "lucide-react";
import { EASE } from "@/lib/motion/constants";
import { useNarrativeScroll } from "./use-narrative-scroll";
import styles from "./site-interactive-stories.module.css";
import narrative from "./story-narrative.module.css";

type Beat = "input" | "request" | "answer" | "return" | "explained";
export function PickerNarrative({ zh, reduced, children, facts, initialExplained, onExplained }: {
  zh: boolean; reduced: boolean; children: ReactNode; initialExplained: boolean; onExplained: () => void;
  facts: { name: string; traction: string; stability: string }[];
}) {
  const [beat, setBeat] = useState<Beat>(reduced || initialExplained ? "explained" : "input");
  const [letters, setLetters] = useState(0);
  const [automatic, setAutomatic] = useState(true);
  const root = useRef<HTMLDivElement>(null);
  const response = useRef<HTMLElement>(null);
  const secondFact = useRef<HTMLElement>(null);
  const scroll = useNarrativeScroll(reduced);
  const example = zh ? "我经常打室外场，最关心抓地和稳定。请帮我了解这两双的取舍。" : "I play outdoors and care most about traction and stability. Help me understand these two picks.";
  const explained = beat === "explained";
  const finish = useCallback(() => { setAutomatic(false); setBeat("explained"); void scroll(root.current, true); }, [scroll]);

  useEffect(() => { if (explained) onExplained(); }, [explained, onExplained]);
  useEffect(() => {
    if (reduced) { setBeat("explained"); return; }
    if (!automatic || explained) return;
    const interrupt = () => { setAutomatic(false); onExplained(); };
    const panel = root.current?.closest("[data-onboarding-story-scroll]");
    panel?.addEventListener("wheel", interrupt, { passive: true });
    panel?.addEventListener("touchstart", interrupt, { passive: true });
    document.addEventListener("visibilitychange", interrupt);
    document.addEventListener("keydown", interrupt);
    return () => {
      panel?.removeEventListener("wheel", interrupt);
      panel?.removeEventListener("touchstart", interrupt);
      document.removeEventListener("visibilitychange", interrupt);
      document.removeEventListener("keydown", interrupt);
    };
  }, [automatic, explained, reduced, onExplained]);
  useEffect(() => {
    if (beat !== "input" || !automatic) return;
    const start = performance.now();
    const timer = window.setInterval(() => {
      const t = Math.min(1, Math.max(0, performance.now() - start - 650) / 2500);
      setLetters(Math.ceil(example.length * t));
      if (t === 1) { window.clearInterval(timer); setBeat("request"); }
    }, 45);
    return () => window.clearInterval(timer);
  }, [beat, automatic, example.length]);
  useEffect(() => {
    if (!automatic || reduced) return;
    let disposed = false;
    let timer = 0;
    if (beat === "request") timer = window.setTimeout(() => setBeat("answer"), 1600);
    if (beat === "answer") timer = window.setTimeout(async () => {
      const arrived = await scroll(response.current);
      if (!disposed && arrived) timer = window.setTimeout(async () => {
        const next = await scroll(secondFact.current);
        if (!disposed && next) timer = window.setTimeout(() => setBeat("return"), 5500);
      }, 5500);
    }, 700);
    if (beat === "return") {
      void scroll(root.current, true).then(arrived => {
        if (!disposed && arrived) timer = window.setTimeout(() => setBeat("explained"), 650);
      });
    }
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [beat, automatic, reduced, scroll]);

  return <div ref={root} className={narrative.picker} data-picker-narrative data-picker-beat={beat} data-explained={explained}>
    <AnimatePresence mode="wait" initial={false}>
      {explained ? <motion.div key="explained" className={narrative.pickerContents} initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0 : 1, ease: EASE }}>
        <p className={narrative.explained}><Sparkles size={15}/>{zh ? "这就是 Smart Picker。现在，试着说出你的需求。" : "This is Smart Picker. Now make the request your own."}</p>
        {children}
      </motion.div> : <motion.div key="demo" className={narrative.pickerContents} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: .75, ease: EASE }}>
        <div className={narrative.demoHeader}><span>{zh ? "先看一个例子" : "Start with an example"}</span><button type="button" onClick={finish}>{zh ? "自己试试" : "Try it yourself"}<ArrowUpRight size={13}/></button></div>
        <motion.div className={`${styles.composer} ${narrative.exampleComposer}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .95, ease: EASE }}>
          <span className={narrative.demoLabel}>{zh ? "示例需求" : "Example request"}</span>
          <p className={narrative.typed} aria-label={example}><span aria-hidden="true">{example.slice(0, beat === "input" ? letters : example.length)}</span><i aria-hidden="true"/></p>
          <div className={styles.composerBottom}><span className={narrative.demoLabel}>{zh ? "演示 · 不会发送请求" : "Demo · No request is sent"}</span><motion.button type="button" className={styles.prepareButton} onClick={() => { setLetters(example.length); setBeat("answer"); setAutomatic(true); }} animate={{ scale: beat === "request" ? [1, 1.04, 1] : 1 }} transition={{ duration: 1.25, ease: EASE }}><ArrowDown size={14}/>{zh ? "预览需求" : "Preview request"}</motion.button></div>
        </motion.div>
        {(beat === "answer" || beat === "return") && <motion.section ref={response} className={narrative.demoResponse} data-picker-demo-response initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: EASE }}>
          <span className={narrative.demoLabel}>{zh ? "球鞋资料示例 · 不是实时 AI 回答" : "Catalog example · Not a live AI response"}</span>
          <h3>{zh ? "从你在意的抓地与稳定开始。" : "Start with traction and stability."}</h3>
          {facts.map((fact, i) => <motion.article ref={i === 1 ? secondFact : undefined} key={fact.name} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.1, delay: .6 + i * .8, ease: EASE }}><h4>{fact.name}</h4><p><strong>{zh ? "抓地" : "Traction"}</strong>{fact.traction}</p><p><strong>{zh ? "稳定" : "Stability"}</strong>{fact.stability}</p></motion.article>)}
          <p className={styles.evidenceNote}>{zh ? "以上来自这两双鞋的已有资料。正式提问后，Smart Picker 会结合你的需求与可用资料梳理取舍；缺少的依据也会明确说明。" : "These are the recorded facts for your picks. After a real request, Smart Picker helps explain the trade-offs using your needs and available evidence, including any gaps."}</p>
        </motion.section>}
        {!automatic && <button type="button" className={narrative.continueDemo} onClick={() => {
          if (beat === "input") { setLetters(example.length); setBeat("request"); }
          else if (beat === "answer" || beat === "return") { finish(); return; }
          setAutomatic(true);
        }}>{zh ? "继续演示" : "Continue the example"}<ArrowUpRight size={14}/></button>}
      </motion.div>}
    </AnimatePresence>
  </div>;
}
