"use client";

import type { ComparisonPhase } from "./use-comparison-entrance";
import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useIsPresent, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronDown, GitCompareArrows, Info, SlidersHorizontal } from "lucide-react";
import { CompareRadar } from "@/components/compare/compare-radar";
import { ComparisonEvidenceTable, hasCompletePerformance } from "@/components/shoe/performance-evidence-table";
import { ProfileNarrative } from "./profile-narrative";
import { PickerNarrative } from "./picker-narrative";
import { ProfileSelections } from "./profile-selections";
import { useNarrativeScroll } from "./use-narrative-scroll";
import pickerStyles from "./picker-narrative.module.css";
import { useInView } from "@/components/motion/use-progress";
import { pickLocalized } from "@/components/i18n/localized-field";
import { DIM_KEYS, DIM_LABELS, type DimKey } from "@/lib/star-rating";
import { type Position } from "@/lib/persona/types";
import type { Shoe as CatalogShoe, ShoeSpec } from "@/lib/types";
import styles from "./site-onboarding.module.css";
import interactive from "./site-interactive-stories.module.css";
import { ScrollHint } from "./scroll-hint";

export type StoryShoe = { name: string; brand: string; image: string | null; slug: string; shoe: CatalogShoe };
export type StoryCatalog = { shoes: StoryShoe[]; shoeCount: number | null; brandCount: number | null };
const ease = [0.22, 1, 0.36, 1] as const;
// Keep only completion/interruption flags, scoped to the persistent Intro
// shell. Returning to the wall can unmount SiteStory without replaying a cue;
// a new explicit run key starts fresh. No selections or drafts enter this cache.
const introDemoRuns = new WeakMap<Element, Map<number, Set<number>>>();
function introDemoSteps(scope: Element | null, runKey: number) {
  if (!scope) return new Set<number>();
  let runs = introDemoRuns.get(scope);
  if (!runs) { runs = new Map(); introDemoRuns.set(scope, runs); }
  let steps = runs.get(runKey);
  if (!steps) { steps = new Set(); runs.set(runKey, steps); }
  while (runs.size > 4) runs.delete(runs.keys().next().value!);
  return steps;
}
const DIM_ZH: Record<DimKey, string> = { cushioning_feel: "缓震脚感", court_feel: "贴地感", bounce: "回弹", stability: "稳定性", traction: "抓地力", fit: "包裹贴合" };
const TECH_FIELDS = [
  { key: "forefoot_midsole_tech", zh: "前掌中底", en: "Forefoot midsole" },
  { key: "heel_midsole_tech", zh: "后掌中底", en: "Heel midsole" },
  { key: "outsole_tech", zh: "外底", en: "Outsole" },
  { key: "upper_tech", zh: "鞋面", en: "Upper" }
] as const;
const dimensionLabel = (key: DimKey, zh: boolean) => zh ? DIM_ZH[key] : DIM_LABELS[key];

function specText(shoe: StoryShoe, key: keyof ShoeSpec, zh: boolean) {
  const en = shoe.shoe.spec?.[key];
  const translated = shoe.shoe.spec?.[`${key}_zh` as keyof ShoeSpec];
  return pickLocalized(zh ? "zh" : "en", typeof en === "string" ? en : null, typeof translated === "string" ? translated : null)?.trim() || (zh ? "资料待补充" : "Not yet documented");
}

function ShoeImage({ shoe, className = "" }: { shoe?: StoryShoe; className?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [shoe?.image]);
  return shoe?.image && !failed ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} src={shoe.image} alt={shoe.name} onError={() => setFailed(true)} draggable={false} />
  ) : (
    <svg viewBox="0 0 400 220" className={className} aria-label={shoe?.name || "Basketball shoe illustration"} role="img">
      <path d="M54 128 72 62 125 76 153 121 226 142 325 152Q365 157 365 177L351 191H55Q30 176 54 128Z" fill="currentColor" opacity=".13"/>
      <path d="M48 163Q180 180 360 174M100 94 148 111M95 110 157 129M87 126 167 145" fill="none" stroke="currentColor" strokeWidth="6" opacity=".3"/>
    </svg>
  );
}

export function BrandLogo({ compact = false, shared = true }: { compact?: boolean; shared?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <motion.div layoutId={reduced || !shared ? undefined : "sf-brand-logo"} transition={{ duration: reduced ? .15 : .6, ease }} className={compact ? styles.logoCompact : styles.logoHero}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="snkrfeature" width="1024" height="1024" draggable={false}/>
    </motion.div>
  );
}

function SelectedPair({ shoes, zh, reduced, compact = false, shared = true }: { shoes: StoryShoe[]; zh: boolean; reduced: boolean; compact?: boolean; shared?: boolean }) {
  return <div className={`${interactive.selectedPair} ${compact ? interactive.compactPair : ""}`}>
    {shoes.map((shoe, index) => <article className={interactive.shoeCard} key={shoe.slug}>
      <span className={interactive.shoeIndex} style={{ color: `rgb(var(--radar-c${index + 1}))` }}>{String(index + 1).padStart(2, "0")}</span>
      <motion.div className={interactive.productImage} data-comparison-target={shoe.slug} layoutId={reduced || !shared ? undefined : `sf-shoe-${shoe.slug}`} transition={{ duration: reduced ? .15 : .65, ease }}><ShoeImage shoe={shoe}/></motion.div>
      <div className={interactive.shoeIdentity}><span>{shoe.brand}</span><strong>{shoe.name}</strong></div>
      {!compact && <a className={interactive.detailLink} href={`/shoes/${shoe.slug}`} target="_blank" rel="noreferrer" aria-label={zh ? `查看 ${shoe.name} 真实资料（新窗口）` : `View ${shoe.name} details (new window)`}>{zh ? "查看资料" : "View details"}<ArrowUpRight size={12}/></a>}
    </article>)}
  </div>;
}

const FieldLayer = forwardRef<HTMLDivElement, { shoes: StoryShoe[]; dimension: DimKey; zh: boolean; reduced: boolean }>(function FieldLayer({ shoes, dimension, zh, reduced }, ref) {
  const present = useIsPresent();
  return <motion.div ref={ref} className={interactive.fieldComparison} data-field-dimension={dimension} data-exiting={!present} inert={!present} aria-hidden={!present} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 9 }} animate={{ opacity: 1, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }} transition={{ duration: reduced ? .12 : present ? .36 : .2, ease }}>
    {shoes.map((shoe, index) => <section key={shoe.slug} className={interactive.fieldColumn}>
      <h4><i style={{ backgroundColor: `rgb(var(--radar-c${index + 1}))` }}/>{shoe.name}</h4>
      <p>{specText(shoe, dimension, zh)}</p>
    </section>)}
  </motion.div>;
});

function FieldComparison({ shoes, dimension, zh, reduced }: { shoes: StoryShoe[]; dimension: DimKey; zh: boolean; reduced: boolean }) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);
  const contentKey = `${dimension}:${zh ? "zh" : "en"}:${shoes.map(shoe => shoe.slug).join(":")}`;

  // Measure the incoming text, not the exiting layer. This keeps the following
  // construction row moving continuously even when the two descriptions have
  // very different lengths, or when a narrower viewport wraps more lines.
  useLayoutEffect(() => {
    const node = contentRef.current;
    if (!node) return;
    const measure = () => setHeight(node.getBoundingClientRect().height);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(node);
    return () => observer?.disconnect();
  }, [contentKey]);

  return <motion.div className={interactive.fieldTransition} data-testid="onboarding-field-transition" initial={false} animate={{ height: height ?? "auto" }} transition={{ duration: reduced ? 0 : .44, ease }}>
    <AnimatePresence initial={false} mode="sync">
      <FieldLayer ref={contentRef} key={contentKey} shoes={shoes} dimension={dimension} zh={zh} reduced={reduced}/>
    </AnimatePresence>
  </motion.div>;
}

function ConstructionDisclosure({ shoes, zh, reduced }: { shoes: StoryShoe[]; zh: boolean; reduced: boolean }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return <section className={interactive.techDetails}>
    <button className={interactive.techToggle} type="button" onClick={() => setOpen(value => !value)} aria-expanded={open} aria-controls={panelId}>
      {zh ? "进一步看科技配置" : "Explore the construction"}
      <motion.span className={interactive.techChevron} animate={{ rotate: reduced ? 0 : open ? 180 : 0 }} transition={{ duration: .4, ease }}><ChevronDown size={16}/></motion.span>
    </button>
    <motion.div id={panelId} data-testid="onboarding-construction-panel" className={interactive.techPanel} inert={!open} aria-hidden={!open} initial={false} animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }} transition={{ height: { duration: reduced ? 0 : .48, ease }, opacity: { duration: reduced ? .12 : open ? .28 : .16 } }}>
      {TECH_FIELDS.map((field, index) => <motion.section key={field.key} className={interactive.techRow} initial={false} animate={{ opacity: open ? 1 : 0, y: reduced ? 0 : open ? 0 : 7 }} transition={{ duration: reduced ? .12 : .3, delay: !reduced && open ? .035 * index : 0, ease }}><h4>{zh ? field.zh : field.en}</h4><div>{shoes.map(shoe => <p key={shoe.slug}><span>{shoe.name}</span>{specText(shoe, field.key, zh)}</p>)}</div></motion.section>)}
    </motion.div>
  </section>;
}

function OnboardingRadar({ shoes, active }: { shoes: CatalogShoe[]; active: boolean }) {
  // Keep the site's existing 220ms delay / 720ms draw-in. The chart itself must
  // enter the viewport: a tall intro scene can be visible well before its radar.
  const { ref, inView } = useInView<HTMLDivElement>(.15, { repeat: true });
  return <div ref={ref} className={interactive.radarDisplay} data-testid="onboarding-radar" data-active={active && inView}><CompareRadar shoes={shoes} active={active && inView}/></div>;
}

const StoryScene = forwardRef<HTMLDivElement, { children: ReactNode; reduced: boolean; label: string; zh: boolean }>(function StoryScene({ children, reduced, label, zh }, ref) {
  const present = useIsPresent();
  const scrollRef = useRef<HTMLDivElement>(null);
  const setRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }, [ref]);
  return <motion.div ref={setRef} className={interactive.scene} data-onboarding-story-scroll role="region" aria-label={label} tabIndex={0} inert={!present} aria-hidden={!present} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? .15 : .55, ease }}>{children}<ScrollHint targetRef={scrollRef} zh={zh}/></motion.div>;
});

export function SiteStory({ step, catalog, zh, selectedShoes, onChangeSelection, positions, picks, onPositions, onPicks, profileExit, onProfileExit, introDemoRunKey = 0, comparisonPhase = "rest", profilePhase = "rest" }: {
  step: number;
  positions: Position[]; picks: DimKey[]; onPositions: (value: Position[]) => void; onPicks: (value: DimKey[]) => void;
  profileExit: boolean; onProfileExit: (completed: boolean) => void;
  catalog: StoryCatalog | null;
  zh: boolean;
  selectedShoes?: StoryShoe[];
  onChangeSelection?: () => void;
  introDemoRunKey?: number;
  comparisonPhase?: ComparisonPhase;
  profilePhase?: ComparisonPhase;
}) {
  const reduced = Boolean(useReducedMotion());
  const stageRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const [dimension, setDimension] = useState<DimKey>("cushioning_feel");
  const [handoff, setHandoff] = useState(false);
  const scroll = useNarrativeScroll(reduced);
  useEffect(() => {
    if (!profileExit || step !== 2) { setHandoff(false); return; }
    let stopped = false; let timer: ReturnType<typeof setTimeout>;
    void scroll(stageRef.current?.querySelector<HTMLElement>("[data-profile-narrative]") ?? null, true).then(arrived => {
      if (stopped) return;
      if (!arrived) { onProfileExit(false); return; }
      setHandoff(true);
      timer = setTimeout(() => onProfileExit(true), reduced ? 0 : 1550);
    });
    return () => { stopped = true; clearTimeout(timer); };
  }, [profileExit, step, reduced, scroll, onProfileExit]);
  // A single finite preview, never a loop. User interaction ends it immediately.
  const demo = useRef({ elapsed: 0, manual: false, timers: [] as number[] });
  const shoes = (selectedShoes ?? []).filter(item => item.shoe?.id).slice(0, 2);
  const primary = shoes[0] ?? catalog?.shoes[0];
  const transition = { duration: reduced ? .15 : .55, ease };
  const havePair = shoes.length === 2;
  const completedDemoSteps = useCallback(() => introDemoSteps(stageRef.current?.closest('[data-testid="site-onboarding"]') ?? stageRef.current?.parentElement ?? null, introDemoRunKey), [introDemoRunKey]);


  const takeControl = useCallback(() => {
    const clock = step === 1 ? demo.current : null;
    if (clock) { clock.manual = true; clock.timers.forEach(window.clearTimeout); clock.timers = []; completedDemoSteps().add(step); }
  }, [step, completedDemoSteps]);

  useEffect(() => {
    const onVisibility = () => setVisible(!document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    const element = stageRef.current;
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0 });
    if (element && observer) observer.observe(element); else setInView(true);
    return () => { document.removeEventListener("visibilitychange", onVisibility); observer?.disconnect(); };
  }, []);

  useEffect(() => {
    const clock = demo.current;
    if (comparisonPhase !== "rest" || step !== 1 || !havePair || completedDemoSteps().has(step) || clock.manual || clock.elapsed >= 2400 || reduced || !inView || !visible) return;
    const start = performance.now();
    clock.timers = ([{ at: 950, key: "traction" }, { at: 1900, key: "stability" }] as const).flatMap(({ at, key }) => at > clock.elapsed ? [window.setTimeout(() => { if (!clock.manual && !document.hidden) setDimension(key); }, at - clock.elapsed)] : []);
    clock.timers.push(window.setTimeout(() => { if (!clock.manual && !document.hidden) completedDemoSteps().add(step); }, 2400 - clock.elapsed));
    return () => { clock.elapsed = Math.min(2400, clock.elapsed + performance.now() - start); clock.timers.forEach(window.clearTimeout); clock.timers = []; };
  }, [step, havePair, reduced, inView, visible, completedDemoSteps, comparisonPhase]);

  useEffect(() => {
    // Capture intent before React handlers or a pending cue can run. Navigating
    // back does not replay a stopped scene; a fresh Intro replay remounts it.
    document.addEventListener("pointerdown", takeControl, true);
    document.addEventListener("keydown", takeControl, true);
    document.addEventListener("input", takeControl, true);
    return () => {
      document.removeEventListener("pointerdown", takeControl, true);
      document.removeEventListener("keydown", takeControl, true);
      document.removeEventListener("input", takeControl, true);
    };
  }, [takeControl]);

  const togglePosition = (position: Position) => onPositions(positions.includes(position) ? positions.filter(p => p !== position) : positions.length < 2 ? [...positions, position] : positions);
  const toggleFocus = (key: DimKey) => onPicks(picks.includes(key) ? picks.filter(p => p !== key) : picks.length < 3 ? [...picks, key] : picks);

  return <div ref={stageRef} className={step === 0 ? styles.storyStage : interactive.stage} data-testid={`onboarding-scene-${step}`} data-story-step={step} data-comparison-phase={comparisonPhase} data-profile-phase={profilePhase} onPointerDownCapture={takeControl} onFocusCapture={takeControl}>
    {step === 0 ? <div className={styles.heroScene}>
      <div className={styles.heroHalo} aria-hidden="true"/>
      <motion.div layoutId={reduced || !primary ? undefined : `sf-shoe-${primary.slug}`} className={styles.heroShoe} initial={reduced ? false : { y: 25, rotate: -12 }} animate={{ y: 0, rotate: reduced ? 0 : -6 }} transition={{ ...transition, duration: reduced ? .15 : 1.1 }}><ShoeImage shoe={primary} className={styles.shoeImage}/></motion.div>
      <div className={styles.heroCaption}><span>{primary?.brand || "SNKRFEATURE"}</span><strong>{primary?.name || (zh ? "找到适合你的一双。" : "Find your next pair.")}</strong></div>
    </div> : !havePair ? <div className={interactive.emptySelection}><GitCompareArrows size={28}/><strong>{zh ? "先选两双，体验真实对比。" : "Pick two shoes to try a real comparison."}</strong><button type="button" onClick={onChangeSelection}>{zh ? "回到球鞋墙" : "Back to the shoe wall"}<ArrowUpRight size={16}/></button></div> : <>
      <div className={interactive.sceneTop}><span>{step === 1 ? "SIDE BY SIDE" : step === 2 ? "YOUR GAME, YOUR PRIORITIES" : "SMART PICKER"}</span><span>{String(step + 1).padStart(2, "0")} / 04</span></div>
      <AnimatePresence initial={false} mode="popLayout">
        {step === 1 && <StoryScene key="comparison" reduced={reduced} zh={zh} label={zh ? "球鞋对比演示" : "Shoe comparison preview"}>
          <div className={interactive.sectionHeading}><div><GitCompareArrows size={18}/><h3>{zh ? "你选的两双，放在一起看。" : "Your two picks. Side by side."}</h3></div><button type="button" className={interactive.textButton} onClick={onChangeSelection}><SlidersHorizontal size={14}/>{zh ? "修改选择" : "Change picks"}</button></div>
          <div className={interactive.comparisonOverview}><SelectedPair shoes={shoes} zh={zh} reduced={reduced} shared={false}/>
          <div className={interactive.radarSection} data-testid="onboarding-real-comparison">
            <div className={interactive.subheading}><strong>{zh ? "六维性能资料" : "Six dimensions of performance"}</strong><span>{zh ? "与站内对比工具一致" : "The same comparison used on the site"}</span></div>
            {shoes.every(shoe => hasCompletePerformance(shoe.shoe)) ? <OnboardingRadar shoes={shoes.map(shoe => shoe.shoe)} active={visible && inView && step === 1 && ["rest", "radar", "copy", "details"].includes(comparisonPhase)}/> : <ComparisonEvidenceTable shoes={shoes.map(shoe => shoe.shoe)}/>}
          </div></div>
          <div className={interactive.comparisonDetails}><div className={interactive.dimensionTabs} aria-label={zh ? "查看真实性能资料" : "Explore recorded performance"}>{DIM_KEYS.map(key => <button type="button" key={key} aria-pressed={dimension === key} onClick={() => setDimension(key)}>{dimensionLabel(key, zh)}</button>)}</div>
          <FieldComparison shoes={shoes} dimension={dimension} zh={zh} reduced={reduced}/>
          <ConstructionDisclosure shoes={shoes} zh={zh} reduced={reduced}/>
          <p className={interactive.evidenceNote}><Info size={14}/>{zh ? "资料参考，并非本站实测；缺少依据的项目不会补分。" : "Reference information, not our own testing. Missing evidence is never filled with a score."}</p></div>
        </StoryScene>}
        {step === 2 && <StoryScene key="profile" reduced={reduced} zh={zh} label={zh ? "球员档案演示" : "Player profile preview"}>
          <AnimatePresence mode="popLayout" initial={false}>{handoff ? <motion.div key="handoff" className={pickerStyles.handoff} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:reduced?0:.8}}><ProfileSelections positions={positions} picks={picks} zh={zh} reduced={reduced}/></motion.div> : <motion.div key="profile-fields" exit={{opacity:0}} transition={{duration:reduced?0:.8}}><ProfileNarrative entranceReady={["rest", "copy", "details"].includes(profilePhase)} zh={zh} reduced={reduced} positions={positions} picks={picks} onPosition={togglePosition} onFocus={toggleFocus} label={key => dimensionLabel(key, zh)} pair={<SelectedPair shoes={shoes} zh={zh} reduced={reduced} compact shared={profilePhase === "rest"}/>} comparison={key => <FieldComparison shoes={shoes} dimension={key} zh={zh} reduced={reduced}/>}/></motion.div>}</AnimatePresence>
        </StoryScene>}
        {step === 3 && <StoryScene key="picker" reduced={reduced} zh={zh} label={zh ? "AI 选鞋演示" : "Smart Picker preview"}>
          <PickerNarrative zh={zh} reduced={reduced} input={positions.length===2 && picks.length===3 ? {positions,priorities:picks,shoeIds:shoes.map(s=>s.shoe.id),lang:zh?"zh":"en"}:null} shoes={shoes} onBack={() => onProfileExit(false)}/>
        </StoryScene>}
      </AnimatePresence>
    </>}
  </div>;
}
