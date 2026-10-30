"use client";

import type { ComparisonPhase } from "./use-comparison-entrance";
import { forwardRef, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, AnimatePresence, useIsPresent, useReducedMotion } from "framer-motion";
import { ArrowUpRight, Check, ChevronDown, GitCompareArrows, Info, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";
import { CompareRadar } from "@/components/compare/compare-radar";
import { ComparisonEvidenceTable, hasCompletePerformance } from "@/components/shoe/performance-evidence-table";
import { PlaystyleDimGrid } from "@/components/preferences/playstyle-dim-grid";
import { useInView } from "@/components/motion/use-progress";
import { pickLocalized } from "@/components/i18n/localized-field";
import { DIM_KEYS, DIM_LABELS, type DimKey } from "@/lib/star-rating";
import { POSITIONS, type Position } from "@/lib/persona/types";
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
const POSITION_NAMES: Record<Position, [string, string]> = { PG: ["控球后卫", "Point guard"], SG: ["得分后卫", "Shooting guard"], SF: ["小前锋", "Small forward"], PF: ["大前锋", "Power forward"], C: ["中锋", "Center"] };
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

function TeachingNote({ cue, labels, zh, reduced }: { cue: number | null; labels: string[]; zh: boolean; reduced: boolean }) {
  const text = cue === null ? (zh ? "现在，按你的习惯试一试。" : "Now explore it your way.") : labels[cue];
  return <div className={interactive.teachingNote} aria-live="off">
    <span className={interactive.teachingProgress} aria-hidden="true">{[0, 1, 2].map(index => <i key={index} data-active={cue === index}/>)}</span>
    <AnimatePresence initial={false} mode="wait"><motion.span key={text} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .12 }}>{text}</motion.span></AnimatePresence>
  </div>;
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

export function SiteStory({ step, catalog, zh, selectedShoes, onChangeSelection, introDemoRunKey = 0, comparisonPhase = "rest" }: {
  step: number;
  catalog: StoryCatalog | null;
  zh: boolean;
  selectedShoes?: StoryShoe[];
  onChangeSelection?: () => void;
  introDemoRunKey?: number;
  comparisonPhase?: ComparisonPhase;
}) {
  const reduced = Boolean(useReducedMotion());
  const stageRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [inView, setInView] = useState(false);
  const [dimension, setDimension] = useState<DimKey>("cushioning_feel");
  const [positions, setPositions] = useState<Position[]>([]);
  const [picks, setPicks] = useState<DimKey[]>([]);
  const [draft, setDraft] = useState("");
  const [prepared, setPrepared] = useState(false);
  const [questionnaire, setQuestionnaire] = useState(false);
  const [court, setCourt] = useState("");
  const [playstyle, setPlaystyle] = useState("");
  const [priority, setPriority] = useState("");
  // A single finite preview, never a loop. User interaction ends it immediately.
  const demo = useRef({ elapsed: 0, manual: false, timers: [] as number[] });
  const teaching = useRef<Record<number, { elapsed: number; manual: boolean; timers: number[] }>>({
    2: { elapsed: 0, manual: false, timers: [] },
    3: { elapsed: 0, manual: false, timers: [] }
  });
  const [teachingCue, setTeachingCue] = useState<{ step: number; cue: number } | null>(null);
  const shoes = (selectedShoes ?? []).filter(item => item.shoe?.id).slice(0, 2);
  const primary = shoes[0] ?? catalog?.shoes[0];
  const transition = { duration: reduced ? .15 : .55, ease };
  const focus = picks[0] ?? "traction";
  const positionText = positions.map(p => `${p} ${POSITION_NAMES[p][zh ? 0 : 1]}`).join(zh ? " / " : " / ");
  const havePair = shoes.length === 2;
  const cue = !reduced && visible && inView && teachingCue?.step === step ? teachingCue.cue : null;
  const completedDemoSteps = useCallback(() => introDemoSteps(stageRef.current?.closest('[data-testid="site-onboarding"]') ?? stageRef.current?.parentElement ?? null, introDemoRunKey), [introDemoRunKey]);

  const takeControl = useCallback(() => {
    const clock = step === 1 ? demo.current : teaching.current[step];
    if (clock) { clock.manual = true; clock.timers.forEach(window.clearTimeout); clock.timers = []; completedDemoSteps().add(step); }
    setTeachingCue(null);
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
    const clock = teaching.current[step];
    if (!clock || !havePair || completedDemoSteps().has(step) || clock.manual || clock.elapsed >= 2600 || reduced || !inView || !visible) { setTeachingCue(null); return; }
    const started = performance.now();
    setTeachingCue({ step, cue: clock.elapsed < 800 ? 0 : clock.elapsed < 1600 ? 1 : 2 });
    // These cues only illuminate actual controls. They never select a position,
    // change rating priorities, fill a draft, open a form or send a request.
    clock.timers = [800, 1600, 2600].flatMap((at, index) => at > clock.elapsed ? [window.setTimeout(() => {
      if (!clock.manual && !document.hidden) {
        if (index === 2) completedDemoSteps().add(step);
        setTeachingCue(index === 2 ? null : { step, cue: index + 1 });
      }
    }, at - clock.elapsed)] : []);
    return () => { clock.elapsed = Math.min(2600, clock.elapsed + performance.now() - started); clock.timers.forEach(window.clearTimeout); clock.timers = []; };
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

  const togglePosition = (position: Position) => setPositions(current => current.includes(position) ? current.filter(p => p !== position) : current.length < 2 ? [...current, position] : current);
  const toggleFocus = (key: DimKey) => setPicks(current => current.includes(key) ? current.filter(p => p !== key) : current.length < 3 ? [...current, key] : current);
  const fillDraft = (text: string) => { setDraft(text); setPrepared(false); };
  const pairNames = shoes.map(shoe => shoe.name).join(zh ? " 和 " : " and ");
  const examples = [
    { label: zh ? "对比这两双" : "Compare my two picks", text: zh ? `请比较 ${pairNames} 的抓地、稳定和缓震，说明资料依据与不足。` : `Compare ${pairNames} for traction, stability and cushioning. Explain the evidence and any gaps.` },
    { label: zh ? "从我的打法出发" : "Start with my game", text: zh ? `我${positions.length ? `打${positionText}` : "经常打篮球"}，最看重${picks.length ? picks.map(key => dimensionLabel(key, true)).join("、") : "抓地和稳定"}。请结合 ${pairNames} 的资料帮我理解取舍，资料不足时请说明。` : `I ${positions.length ? `play ${positionText}` : "play basketball regularly"} and care most about ${picks.length ? picks.map(key => dimensionLabel(key, false)).join(", ") : "traction and stability"}. Help me understand the trade-offs between ${pairNames}, and note any missing evidence.` }
  ];

  return <div ref={stageRef} className={step === 0 ? styles.storyStage : interactive.stage} data-testid={`onboarding-scene-${step}`} data-story-step={step} data-comparison-phase={comparisonPhase} data-teaching-phase={cue ?? "quiet"} onPointerDownCapture={takeControl} onFocusCapture={takeControl}>
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
          <div className={interactive.profileHeading}><motion.div className={interactive.profileMark} layoutId={reduced ? undefined : "sf-player-card"} transition={transition}><UserRound size={23}/><span>{positions.length ? positions.join(" / ") : "YOU"}</span></motion.div><div><h3>{zh ? "先从你的打法开始。" : "Start with your game."}</h3><p>{zh ? "试选你的位置和关注重点，看看资料怎样变得更好读。" : "Try your positions and priorities, then see the details that matter to you."}</p></div></div>
          <TeachingNote cue={cue} zh={zh} reduced={reduced} labels={zh ? ["先选常打的位置，最多两个。", "再按顺序点选你最在意的三项。", "在下方，读你关注的真实鞋款资料。"] : ["Start with up to two on-court positions.", "Then choose three priorities, in order.", "Read the documented details that matter to you."]}/>
          <fieldset className={`${interactive.positionField} ${interactive.teachingTarget}`} data-teaching-target="positions" data-teaching={cue === 0}><legend>{zh ? "场上位置" : "On-court position"}<span>{zh ? "可选 1–2 个" : "Choose up to two"}</span></legend><div className={interactive.positionGrid}>{POSITIONS.map(position => <button type="button" key={position} aria-pressed={positions.includes(position)} onClick={() => togglePosition(position)}><strong>{position}</strong><span>{POSITION_NAMES[position][zh ? 0 : 1]}</span>{positions.includes(position) && <Check size={12}/>}</button>)}</div></fieldset>
          <section className={`${interactive.focusSection} ${interactive.teachingTarget}`} data-teaching-target="priorities" data-teaching={cue === 1}><div className={interactive.subheading}><strong>{zh ? "你最在意什么？" : "What matters most?"}</strong><span>{zh ? "依次选 3 项 · 顺序就是优先级" : "Pick three in priority order"}</span></div><PlaystyleDimGrid picks={picks} onToggle={toggleFocus}/><div className={interactive.priorityOrder} aria-live="polite">{picks.length ? picks.map((key, index) => <span key={key}><b>{index + 1}</b>{dimensionLabel(key, zh)}</span>) : <span>{zh ? "试着点一下抓地力，或你最关心的维度。" : "Try traction, or the dimension you care about most."}</span>}</div></section>
          <div className={`${interactive.focusPreview} ${interactive.teachingTarget}`} data-teaching-target="profile-evidence" data-teaching={cue === 2}><div className={interactive.subheading}><strong>{picks.length ? (zh ? `优先看：${dimensionLabel(focus, zh)}` : `Look first: ${dimensionLabel(focus, zh)}`) : (zh ? "先看看抓地资料" : "A first look at traction")}</strong><span>{zh ? "仍然是你选的两双" : "Still your two selected shoes"}</span></div><SelectedPair shoes={shoes} zh={zh} reduced={reduced} compact/><FieldComparison shoes={shoes} dimension={focus} zh={zh} reduced={reduced}/></div>
          <p className={interactive.evidenceNote}><Info size={14}/>{zh ? "这里只临时试选，不会保存。注册后再把你的位置和偏好加入正式球员档案。" : "This is a temporary preview and will not be saved. Add your positions and priorities to your player profile after signing up."}</p>
        </StoryScene>}
        {step === 3 && <StoryScene key="picker" reduced={reduced} zh={zh} label={zh ? "AI 选鞋演示" : "Smart Picker preview"}>
          <div className={interactive.pickerHeading}><span className={interactive.pickerIcon}><Sparkles size={21}/></span><div><h3>Smart Picker</h3><p>{zh ? "把需求说清楚，让选鞋有方向。" : "Put your needs into words."}</p></div><motion.div className={interactive.identityBadge} layoutId={reduced ? undefined : "sf-player-card"} transition={transition}><UserRound size={12}/><span>{positions.length ? positions.join(" / ") : (zh ? "你的打法" : "Your game")}</span></motion.div></div>
          <div className={interactive.previewTag}>{zh ? "交互预览 · 注册后才能正式询问 AI" : "Interactive preview · Sign up to ask AI"}</div>
          <TeachingNote cue={cue} zh={zh} reduced={reduced} labels={zh ? ["先说出你的打法、场地和需求。", "还没想好？这里可以帮你整理需求。", "下方是所选两双的真实资料预览。"] : ["Describe your game, your court and your needs.", "Need a starting point? Try the questionnaire here.", "Below are the documented facts for your two picks."]}/>
          <div className={interactive.exampleChips}>{examples.map(example => <button key={example.label} type="button" onClick={() => fillDraft(example.text)}><Sparkles size={13}/>{example.label}</button>)}</div>
          <div className={`${interactive.composer} ${interactive.teachingTarget}`} data-teaching-target="picker-input" data-teaching={cue === 0}><label htmlFor="onboarding-picker-draft">{zh ? "你的选鞋需求" : "Your shoe request"}</label><textarea id="onboarding-picker-draft" value={draft} onChange={event => fillDraft(event.target.value)} maxLength={3000} rows={4} placeholder={zh ? "例如：我经常打室外场，最关心抓地和稳定……" : "For example: I play outdoors and care most about traction and stability…"}/><div className={interactive.composerBottom}><button className={`${interactive.questionnaireToggle} ${interactive.teachingTarget}`} data-teaching-target="picker-questionnaire" data-teaching={cue === 1} type="button" aria-expanded={questionnaire} aria-controls="onboarding-questionnaire" onClick={() => setQuestionnaire(value => !value)}><SlidersHorizontal size={14}/>{zh ? "帮我组织需求" : "Help me describe it"}</button><button className={interactive.prepareButton} type="button" disabled={!draft.trim()} onClick={() => setPrepared(true)}>{prepared ? <Check size={16}/> : <ArrowUpRight size={16}/>}<span>{prepared ? (zh ? "已准备好" : "Ready") : (zh ? "预览需求" : "Preview request")}</span></button></div></div>
          <AnimatePresence initial={false}>{questionnaire && <motion.div id="onboarding-questionnaire" className={interactive.questionnaire} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: .2 }}><p>{zh ? "和正式问卷一样，只填写你愿意提供的信息。" : "As in the full questionnaire, share only what you want."}</p><div className={interactive.questionnaireFields}><label>{zh ? "主要场地" : "Main court"}<input value={court} onChange={e => setCourt(e.target.value)} placeholder={zh ? "室内木地板 / 室外水泥地" : "Indoor hardwood / outdoor concrete"}/></label><label>{zh ? "打法风格" : "Playstyle"}<input value={playstyle} onChange={e => setPlaystyle(e.target.value)} placeholder={zh ? "突破、投射、组织、内线" : "Slasher, shooter, playmaker, post"}/></label><label>{zh ? "最看重的性能" : "Your priorities"}<input value={priority} onChange={e => setPriority(e.target.value)} placeholder={picks.length ? picks.map(key => dimensionLabel(key, zh)).join(zh ? "、" : ", ") : (zh ? "抓地、缓震、稳定……" : "Traction, cushioning, stability…")}/></label></div><button type="button" className={interactive.textButton} disabled={!court.trim() && !playstyle.trim() && !priority.trim() && !positions.length && !picks.length} onClick={() => {
            const lines = [positionText && `${zh ? "位置" : "Position"}: ${positionText}`, court.trim() && `${zh ? "场地" : "Court"}: ${court.trim()}`, playstyle.trim() && `${zh ? "打法" : "Playstyle"}: ${playstyle.trim()}`, (priority.trim() || picks.length) && `${zh ? "关注重点" : "Priorities"}: ${priority.trim() || picks.map(key => dimensionLabel(key, zh)).join(", ")}`].filter(Boolean);
            fillDraft(`${zh ? "帮我了解适合自己的篮球鞋。" : "Help me understand basketball shoes for my game."}\n${lines.join("\n")}\n${zh ? "想了解的两双" : "The two shoes I want to explore"}: ${pairNames}`);
            setQuestionnaire(false);
          }}>{zh ? "整理到输入框" : "Add to the composer"}<ArrowUpRight size={14}/></button></motion.div>}</AnimatePresence>
          <AnimatePresence initial={false}>{prepared && <motion.div role="status" className={interactive.preparedNote} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}><Check size={17}/><div><strong>{zh ? "需求已准备好，还没有发送。" : "Your request is ready. It has not been sent."}</strong><p>{zh ? "注册后前往 Smart Picker，正式询问后才会得到个性化回答。" : "After signing up, visit Smart Picker and send a request for a personalized response."}</p></div></motion.div>}</AnimatePresence>
          <section className={`${interactive.sourcePreview} ${interactive.teachingTarget}`} data-teaching-target="picker-evidence" data-teaching={cue === 2}><div className={interactive.subheading}><strong>{zh ? "先看这两双的已有资料" : "Explore the documented details"}</strong><span>{zh ? "真实资料预览 · 非 AI 推荐结果" : "Catalog preview · Not an AI recommendation"}</span></div><SelectedPair shoes={shoes} zh={zh} reduced={reduced}/><div className={interactive.previewFacts}>{shoes.map(shoe => <p key={shoe.slug}><strong>{shoe.name}</strong><span>{dimensionLabel(focus, zh)}</span>{specText(shoe, focus, zh)}</p>)}</div></section>
          <p className={interactive.evidenceNote}><Info size={14}/>{zh ? "预览不会发送请求，不会消耗 AI 额度。这里的内容来自球鞋资料，不是 AI 为你生成的选鞋结论。" : "This preview sends no requests and uses no AI credits. These are catalog facts, not generated recommendations."}</p>
        </StoryScene>}
      </AnimatePresence>
    </>}
  </div>;
}
