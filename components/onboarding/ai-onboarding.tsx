"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, ArrowUp, Check, CircleHelp, GitCompareArrows, Layers3, MessageSquareText, RotateCcw, Sparkles, X } from "lucide-react";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { useLocale } from "@/components/i18n/locale-provider";
import { EASE } from "@/lib/motion/constants";
import { ScrollHint } from "./scroll-hint";
import styles from "./ai-onboarding.module.css";

type Status = "skipped" | "completed";
type Rect = { x: number; y: number; width: number; height: number };
type Props = {
  /** Both the real chat and the real allowance must have loaded successfully. */
  ready: boolean;
  /** Generating, loading history, or displaying another business dialog. */
  busy: boolean;
  /** An inline failure should not be interrupted, but manual help still works. */
  autoBlocked?: boolean;
  onActiveChange?: (active: boolean) => void;
};

const LOCAL_KEY = "sf-onboarding-ai-v2:";
const REPLAY_KEY = "sf-replay-ai-v2";
const TARGETS = [
  null,
  '[data-onboarding="ai-input"]',
  '[data-onboarding="ai-examples"], [data-onboarding="ai-questionnaire"]',
  '[data-onboarding="ai-result"]',
  '[data-onboarding="ai-send"]'
] as const;

const memoryStatus = new Map<string, Status>();

function readStatus(id: string): Status | null {
  const saved = memoryStatus.get(id);
  if (saved) return saved;
  try {
    const value = window.localStorage.getItem(LOCAL_KEY + id);
    return value === "completed" || value === "skipped" ? value : null;
  } catch {
    return null;
  }
}

function rectOf(element: Element): Rect {
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

function visibleTarget(selector: string | null): Rect | null {
  if (!selector) return null;
  const elements = Array.from(document.querySelectorAll(selector));
  for (const element of elements) {
    const r = rectOf(element);
    // Never scroll a conversation behind the user's back to manufacture an
    // anchor. Offscreen results receive the explicitly labelled demonstration.
    if (r.width > 12 && r.height > 12 && r.y >= 8 && r.y + r.height <= window.innerHeight - 8 && r.x >= 0 && r.x + r.width <= window.innerWidth) return r;
  }
  return null;
}

function anotherDialogOpen(): boolean {
  return Array.from(document.querySelectorAll('[aria-modal="true"], dialog[open], [data-onboarding-blocking="true"]')).some((element) => {
    if (element.closest("[data-ai-onboarding]")) return false;
    const r = element.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/**
 * A separate, account-scoped tutorial. It never sends an AI request, mutates a
 * conversation, fills a draft, or scrolls the real conversation. The measured
 * controls stay in their original component tree throughout the presentation.
 */
export function AiOnboarding({ ready, busy, autoBlocked = false, onActiveChange }: Props) {
  const { userId, signedIn, loaded } = useAuthState();
  const { locale } = useLocale();
  const zh = locale === "zh";
  const reduced = Boolean(useReducedMotion());
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ownerRef = useRef<string | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const openedForRef = useRef<string | null>(null);
  const replayMarkerCheckedRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [eligibility, setEligibility] = useState<{ userId: string; unseen: boolean } | null>(null);
  const [requested, setRequested] = useState(false);
  const [phase, setPhase] = useState<"idle" | "open" | "closing">("idle");
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [demoKey, setDemoKey] = useState(0);
  const [externalDialog, setExternalDialog] = useState(false);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const [helpRect, setHelpRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(540);
  const [viewport, setViewport] = useState({ width: 1024, height: 768 });
  const [flight, setFlight] = useState<{ from: Rect; to: Rect } | null>(null);
  const [hint, setHint] = useState(false);
  const [waitingHint, setWaitingHint] = useState(false);
  const shown = phase !== "idle" && !externalDialog && !busy;
  const canStart = loaded && signedIn && Boolean(userId) && ready && !busy && !externalDialog && (!autoBlocked || requested);

  useEffect(() => { setMounted(true); }, []);

  // A failed status read is not evidence that this is a first visit. The help
  // button remains usable and a known local completion still suppresses repeats.
  useEffect(() => {
    ownerRef.current = userId;
    openedForRef.current = null;
    setEligibility(null);
    setPhase("idle");
    setHint(false);
    if (!loaded || !signedIn || !userId) return;
    const controller = new AbortController();
    const account = userId;
    const local = readStatus(account);
    if (local) setEligibility({ userId: account, unseen: false });
    void fetch("/api/onboarding", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? response.json() : null)
      .then((data: { userId?: string; tours?: { ai?: Status | null } } | null) => {
        if (controller.signal.aborted || ownerRef.current !== account || data?.userId !== account || !data.tours) return;
        const status = data.tours?.ai;
        if (status === "completed" || status === "skipped") {
          memoryStatus.set(account, status);
          try { window.localStorage.setItem(LOCAL_KEY + account, status); } catch { /* optional storage */ }
        }
        setEligibility({ userId: account, unseen: !status && !local });
      })
      .catch(() => { /* Manual replay is available even when preferences are offline. */ });
    return () => controller.abort();
  }, [loaded, signedIn, userId]);

  useEffect(() => {
    const inspect = () => setExternalDialog(anotherDialogOpen());
    inspect();
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-modal", "open", "data-onboarding-blocking"] });
    return () => observer.disconnect();
  }, []);

  const requestReplay = useCallback(() => {
    if (phase !== "idle") return;
    setRequested(true);
    setHint(false);
    setWaitingHint(true);
  }, [phase]);

  useEffect(() => {
    const replay = (event: Event) => {
      if ((event as CustomEvent<{ kind?: string }>).detail?.kind === "ai") requestReplay();
    };
    window.addEventListener("sf:replay-tutorial", replay);
    if (!replayMarkerCheckedRef.current) {
      replayMarkerCheckedRef.current = true;
      try { if (window.sessionStorage.getItem(REPLAY_KEY) === "1") requestReplay(); } catch { /* optional storage */ }
    }
    return () => window.removeEventListener("sf:replay-tutorial", replay);
  }, [requestReplay]);

  useEffect(() => {
    if (!canStart || !userId || phase !== "idle") return;
    const firstVisit = eligibility?.userId === userId && eligibility.unseen && openedForRef.current !== userId;
    if (!requested && !firstVisit) return;
    // Wait until the actual header and composer have a stable layout. Cleanup
    // prevents a background permission/dialog change from starting a stale tour.
    const timer = window.setTimeout(() => {
      if (!buttonRef.current || anotherDialogOpen()) return;
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      openedForRef.current = userId;
      setStep(0);
      setDirection(1);
      setDemoKey((key) => key + 1);
      setPhase("open");
      setRequested(false);
      setWaitingHint(false);
      setFlight(null);
      try { window.sessionStorage.removeItem(REPLAY_KEY); } catch { /* optional storage */ }
    }, requested ? 80 : 550);
    return () => window.clearTimeout(timer);
  }, [canStart, eligibility, phase, requested, userId]);

  useEffect(() => {
    onActiveChange?.(shown);
    return () => onActiveChange?.(false);
  }, [shown, onActiveChange]);

  // Account changes close the tutorial before another person's saved state can
  // be used. Geometry listens to visualViewport too, including mobile keyboards.
  useEffect(() => {
    if (!mounted) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setViewport({ width: window.innerWidth, height: window.innerHeight });
        setAnchor(visibleTarget(TARGETS[step]));
        if (buttonRef.current) setHelpRect(rectOf(buttonRef.current));
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (buttonRef.current) observer.observe(buttonRef.current);
    const target = TARGETS[step] ? document.querySelector(TARGETS[step]!) : null;
    if (target) observer.observe(target);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [mounted, step, shown, hint, waitingHint]);

  useEffect(() => {
    if (!shown || !cardRef.current) return;
    const observer = new ResizeObserver(([entry]) => setCardHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height));
    observer.observe(cardRef.current);
    cardRef.current.focus({ preventScroll: true });
    return () => observer.disconnect();
  }, [shown]);

  const finishFlight = useCallback(() => {
    setPhase("idle");
    setFlight(null);
    setHint(true);
    // Give the actual replay control focus, without moving the conversation.
    if (buttonRef.current?.isConnected) buttonRef.current.focus({ preventScroll: true });
    else if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
  }, []);

  const finish = useCallback((status: Status) => {
    if (phase !== "open") return;
    const account = userId;
    if (account && ownerRef.current === account) {
      const previous = readStatus(account);
      // Replaying and then skipping must never erase an earlier completion.
      const saved = previous === "completed" ? previous : status;
      memoryStatus.set(account, saved);
      try { window.localStorage.setItem(LOCAL_KEY + account, saved); } catch { /* optional storage */ }
      setEligibility({ userId: account, unseen: false });
      void fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tour: "ai", status: saved })
      }).catch(() => { /* The account-keyed fallback preserves the action. */ });
    }
    const from = cardRef.current ? rectOf(cardRef.current) : null;
    const to = buttonRef.current ? rectOf(buttonRef.current) : null;
    if (from && to && to.width > 0 && to.height > 0) {
      setFlight({ from, to });
      setPhase("closing");
    } else {
      // The help control can disappear during route teardown. Do not strand an
      // intercepting overlay waiting for an animation towards a missing node.
      finishFlight();
    }
  }, [phase, userId, finishFlight]);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(false), 2800);
    return () => window.clearTimeout(timer);
  }, [hint]);

  useEffect(() => {
    if (!shown) return;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); finish("skipped"); return; }
      if (event.key !== "Tab" || !cardRef.current) return;
      const items = Array.from(cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex="0"]'));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === cardRef.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !cardRef.current.contains(document.activeElement))) {
        event.preventDefault(); first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [shown, finish]);

  // A paused closing animation still has a bounded exit (e.g. route protection
  // opens a dialog). Avoid retaining a closing state forever when it unmounts.
  useEffect(() => {
    if (phase !== "closing") return;
    const timer = window.setTimeout(finishFlight, reduced ? 220 : 800);
    return () => window.clearTimeout(timer);
  }, [phase, reduced, finishFlight]);

  const next = () => {
    if (phase !== "open") return;
    if (step === 4) { finish("completed"); return; }
    setDirection(1);
    setStep((value) => Math.min(4, value + 1));
    setDemoKey((key) => key + 1);
  };
  const back = () => {
    if (phase !== "open") return;
    setDirection(-1);
    setStep((value) => Math.max(0, value - 1));
    setDemoKey((key) => key + 1);
  };
  const titles = zh
    ? ["懂你的打法，帮你选鞋。", "从你的真实需求开始。", "不知道怎么说？从这里开始。", "看懂推荐，再做决定。", "准备好，发出你的第一句。"]
    : ["Your game. A clearer choice.", "Start with what you need.", "A little help getting started.", "Understand the recommendation.", "Your first request starts here."];
  const descriptions = zh
    ? ["AI 选鞋会结合你的描述，在 snkrfeature 的球鞋资料中帮你理解、比较和挑选。", "说说打法、场地、脚型，以及你最在意的脚感。已保存的球员档案会让描述更省心。", "点选示例可以开始描述，也可以用「帮我生成」整理需求。发送前，你始终可以修改。", "先读推荐理由，再看详细分析；把感兴趣的鞋加入对比。推荐是参考，选择由你决定。", "下方箭头就是发送。先检查内容和推荐数量，再由你亲自发送。现在，按自己的节奏开始。"]
    : ["Describe your game. Smart Picker helps you understand, compare and choose using the snkrfeature shoe catalog.", "Share your playstyle, court, fit and the feel you want. A saved player profile makes the conversation easier.", "Try a suggestion or use “Build it for me” to organize your needs. You can always edit before sending.", "Read why a shoe was suggested, open its analysis and compare your shortlist. Recommendations help you decide.", "The arrow below sends your request. Check your message and number of picks, then send when you're ready."];
  const cardWidth = Math.min(step === 0 ? 760 : 590, viewport.width - 32);
  const spaceAbove = anchor ? anchor.y - 36 : 0;
  const spaceBelow = anchor ? viewport.height - anchor.y - anchor.height - 36 : 0;
  const placeAbove = spaceAbove > spaceBelow;
  const maxCardHeight = anchor && step > 0
    ? Math.min(viewport.height - 32, Math.max(260, placeAbove ? spaceAbove : spaceBelow))
    : viewport.height - 32;
  const measuredHeight = Math.min(cardHeight, maxCardHeight);
  const cardX = Math.max(16, Math.min(viewport.width - cardWidth - 16, anchor ? anchor.x + anchor.width / 2 - cardWidth / 2 : (viewport.width - cardWidth) / 2));
  const preferredY = anchor && placeAbove
    ? anchor.y - measuredHeight - 20
    : anchor
      ? anchor.y + anchor.height + 20
      : (viewport.height - measuredHeight) / 2;
  const cardY = Math.max(16, Math.min(viewport.height - measuredHeight - 16, preferredY));
  const closing = phase === "closing" && flight;
  const closeX = closing ? flight.to.x + flight.to.width / 2 - flight.from.x - flight.from.width / 2 : 0;
  const closeY = closing ? flight.to.y + flight.to.height / 2 - flight.from.y - flight.from.height / 2 : 0;
  const hintX = helpRect ? Math.max(16, Math.min(viewport.width - 292, helpRect.x + helpRect.width - 280)) : 16;
  const hintY = helpRect ? Math.min(viewport.height - 100, helpRect.y + helpRect.height + 12) : 80;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={requestReplay}
        className={`${styles.helpButton} ${hint ? styles.helpPulse : ""}`}
        data-onboarding="ai-help"
        aria-label={zh ? "重看 AI 选鞋使用指南" : "Replay the Smart Picker guide"}
        aria-haspopup="dialog"
        aria-expanded={shown}
        title={zh ? "AI 选鞋使用指南" : "Smart Picker guide"}
      >
        <CircleHelp size={18} strokeWidth={1.7} />
        <span>{zh ? "使用指南" : "Guide"}</span>
      </button>
      {mounted && createPortal(
        <div data-ai-onboarding data-tour-phase={phase} className={styles.portal}>
          <>
            {shown && (
              <motion.div key="guide" className={styles.overlay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
                <motion.svg className={styles.shade} aria-hidden="true" width="100%" height="100%" animate={{ opacity: phase === "closing" ? 0 : 1 }} transition={{ duration: reduced ? 0.16 : 0.55, ease: EASE }}>
                  <defs><mask id={`${id}-spotlight`}><rect width="100%" height="100%" fill="white" />
                    {anchor && step > 0 && <motion.rect initial={false} animate={{ x: anchor.x - 7, y: anchor.y - 7, width: anchor.width + 14, height: anchor.height + 14 }} rx="16" fill="black" transition={{ duration: reduced ? 0 : 0.5, ease: EASE }} />}
                  </mask></defs>
                  <rect width="100%" height="100%" fill="currentColor" mask={`url(#${id}-spotlight)`} />
                </motion.svg>
                {anchor && step > 0 && phase === "open" && <motion.div aria-hidden initial={{ opacity: 0 }} animate={{ opacity: 1, left: anchor.x - 7, top: anchor.y - 7, width: anchor.width + 14, height: anchor.height + 14 }} transition={{ duration: reduced ? 0.12 : 0.5, ease: EASE }} className={styles.spotlight} />}
                <motion.div
                  ref={cardRef}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`${id}-title`}
                  aria-describedby={`${id}-description`}
                  tabIndex={-1}
                  className={`${styles.card} ${step === 0 ? styles.introCard : ""}`}
                  layout={!reduced && phase === "open"}
                  style={{ left: closing ? flight.from.x : cardX, top: closing ? flight.from.y : cardY, width: closing ? flight.from.width : cardWidth, height: closing ? flight.from.height : undefined, maxHeight: maxCardHeight, transformOrigin: "center center" }}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
                  animate={closing
                    ? reduced ? { opacity: 0 } : { opacity: 1, x: closeX, y: closeY, scaleX: flight.to.width / flight.from.width, scaleY: flight.to.height / flight.from.height }
                    : { opacity: 1, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1 }}
                  transition={{ duration: reduced ? 0.16 : closing ? 0.65 : 0.5, ease: EASE }}
                  onAnimationComplete={() => { if (phase === "closing") finishFlight(); }}
                >
                  <motion.div animate={{ opacity: phase === "closing" ? 0 : 1 }} transition={{ duration: 0.16 }} className={styles.cardContents} style={{ maxHeight: maxCardHeight - 2 }}>
                    <header className={styles.cardHeader}>
                      <div className={styles.eyebrow}><Sparkles size={14} />{zh ? "AI 选鞋指南" : "SMART PICKER GUIDE"}</div>
                      <button type="button" className={styles.skip} onClick={() => finish("skipped")} disabled={phase !== "open"}>{zh ? "跳过" : "Skip"}<X size={14} /></button>
                    </header>
                    <div ref={scrollRef} className={styles.scrollBody}>
                      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
                        <motion.div key={step} custom={direction} initial={reduced ? { opacity: 0 } : { opacity: 0, x: direction * 24, y: 6 }} animate={{ opacity: 1, x: 0, y: 0 }} exit={reduced ? { opacity: 0 } : { opacity: 0, x: direction * -18, y: -4 }} transition={{ duration: reduced ? 0.16 : 0.48, ease: EASE }} className={styles.stepBody}>
                          <p className={styles.chapter}>{zh ? ["认识 AI 选鞋", "描述你的需求", "找到起点", "理解推荐", "开始探索"][step] : ["MEET YOUR PICKER", "YOUR NEEDS", "A STARTING POINT", "YOUR SHORTLIST", "READY WHEN YOU ARE"][step]}</p>
                          <h2 id={`${id}-title`} className={styles.title}>{titles[step]}</h2>
                          <p id={`${id}-description`} className={styles.description}>{descriptions[step]}</p>
                          <DemoScene key={`${step}-${demoKey}`} step={step} zh={zh} reduced={reduced} realResult={step === 3 && Boolean(anchor)} />
                        </motion.div>
                      </AnimatePresence>
                      <ScrollHint targetRef={scrollRef} zh={zh}/>
                    </div>
                    <footer className={styles.footer}>
                      <div className={styles.progress} aria-label={zh ? `第 ${step + 1} 步，共 5 步` : `Step ${step + 1} of 5`}>
                        {[0, 1, 2, 3, 4].map((index) => <span key={index} className={index === step ? styles.currentDot : index < step ? styles.doneDot : ""} />)}
                        <span className={styles.stepNumber}>{step + 1}<span>/ 5</span></span>
                      </div>
                      <div className={styles.actions}>
                        <button type="button" onClick={() => setDemoKey((key) => key + 1)} className={styles.replayDemo} aria-label={zh ? "重播本屏演示" : "Replay this demonstration"} title={zh ? "重播本屏演示" : "Replay this demonstration"} disabled={phase !== "open"}><RotateCcw size={15} /></button>
                        {step > 0 && <button type="button" className={styles.back} onClick={back} disabled={phase !== "open"} aria-label={zh ? "上一步" : "Previous step"}><ArrowLeft size={18} /></button>}
                        <motion.button whileTap={reduced ? undefined : { scale: 0.98 }} type="button" className={styles.next} onClick={next} disabled={phase !== "open"}>{step === 4 ? (zh ? "开始选鞋" : "Start exploring") : (zh ? "继续" : "Continue")}<ArrowRight size={17} /></motion.button>
                      </div>
                    </footer>
                  </motion.div>
                </motion.div>
              </motion.div>
            )}
          </>
          <AnimatePresence>
            {(hint || (waitingHint && !shown)) && helpRect && (
              <motion.div key="replay-hint" role="status" className={styles.hint} style={{ left: hintX, top: hintY }} initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: EASE }}>
                <CircleHelp size={20} />
                <div><strong>{hint ? (zh ? "想再看一次？" : "Want another look?") : (zh ? "使用指南已准备好" : "Your guide is ready")}</strong><p>{hint ? (zh ? "随时点击这里的「使用指南」。" : "Open Guide here whenever you like.") : (zh ? "当前操作结束、界面就绪后即可开始。" : "It will open when the current action finishes.")}</p></div>
                <button type="button" aria-label={zh ? "关闭提示" : "Dismiss hint"} onClick={() => { setHint(false); setWaitingHint(false); setRequested(false); }}><X size={14} /></button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>, document.body
      )}
    </>
  );
}

function ShoeDrawing({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 240 128" fill="none" aria-hidden="true"><path d="M32 69c11-2 22-5 32-14l16-22c3-5 10-4 13 2l10 20 25 10c13 5 19 11 22 16l39 4c16 2 25 9 24 18l-1 6H28c-10 0-15-8-12-18l3-10c2-6 7-10 13-12Z" fill="currentColor" fillOpacity=".09" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="m79 48 24 13M71 58l24 12M61 67l25 12M27 94c29 3 45 0 63-4 14-3 24-3 39 0 21 5 42 8 78 8M43 108v-9m20 9v-9m22 9V96m23 12V95m24 13v-9m25 9v-6m25 6v-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/><path d="M128 74c-18 19-43 23-70 17" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/></svg>;
}

function DemoScene({ step, zh, reduced, realResult }: { step: number; zh: boolean; reduced: boolean; realResult: boolean }) {
  const [chosen, setChosen] = useState(0);
  const touched = useRef(false);
  useEffect(() => {
    if (step !== 2 || reduced) return;
    const timers = [1, 2].map((value) => window.setTimeout(() => {
      if (!touched.current) setChosen(value);
    }, value * 850));
    return () => timers.forEach(window.clearTimeout);
  }, [step, reduced]);
  const enter = (delay: number) => ({ initial: reduced ? false as const : { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: reduced ? 0.12 : 0.55, delay: reduced ? 0 : delay, ease: EASE } });
  const sample = zh ? ["我打控卫", "常在室外场", "想要抓地和稳定"] : ["I play guard", "Mostly outdoors", "Traction and stability"];

  if (step === 0) return (
    <div className={`${styles.scene} ${styles.introScene}`} aria-label={zh ? "需求、球鞋资料、推荐结果的关系演示" : "How your needs become a shortlist"}>
      <motion.div {...enter(0.08)} className={styles.inputNode}><MessageSquareText size={20} /><span>{zh ? "你的打法与需求" : "Your game & needs"}</span><div className={styles.miniChips}><span>{zh ? "突破" : "Slashing"}</span><span>{zh ? "抓地" : "Traction"}</span></div></motion.div>
      <div className={styles.connection} aria-hidden><motion.span initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ delay: reduced ? 0 : 0.4, duration: 0.6, ease: EASE }} /><motion.i initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 0.65 }}><Sparkles size={16} /></motion.i></div>
      <motion.div {...enter(0.75)} className={styles.catalogNode}><Layers3 size={22} /><span>snkrfeature</span><small>{zh ? "球鞋资料" : "Shoe catalog"}</small></motion.div>
      <div className={styles.connection} aria-hidden><motion.span initial={{ scaleX: reduced ? 1 : 0 }} animate={{ scaleX: 1 }} transition={{ delay: reduced ? 0 : 1.05, duration: 0.6, ease: EASE }} /></div>
      <motion.div {...enter(1.35)} className={styles.shoeNode}><ShoeDrawing /><span>{zh ? "更清楚的选择" : "A clearer shortlist"}</span><div className={styles.reasonLines}><i /><i /></div></motion.div>
      <motion.p {...enter(1.85)} className={styles.sceneCaption}>{zh ? "把你的需求，与球鞋的特点连接起来。" : "Connect what you need with what a shoe offers."}</motion.p>
    </div>
  );

  if (step === 1) return (
    <div className={styles.scene}>
      <div className={styles.demoLabel}>{zh ? "描述示例 · 不会写入你的输入框" : "EXAMPLE · YOUR DRAFT STAYS UNCHANGED"}</div>
      <motion.div {...enter(0.08)} className={styles.promptDemo}><span className={styles.promptCaret} aria-hidden /><p>{sample.map((part, index) => <motion.span key={part} initial={{ opacity: reduced ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ delay: reduced ? 0 : 0.3 + index * 0.4, duration: 0.35 }}>{part}{index < 2 ? (zh ? "，" : ". ") : (zh ? "。" : ".")}</motion.span>)}</p></motion.div>
      <div className={styles.promptTags}>{[zh ? "打法" : "Playstyle", zh ? "场地" : "Court", zh ? "偏好" : "Feel"].map((tag, index) => <motion.span {...enter(0.45 + index * 0.4)} key={tag}><Check size={13} />{tag}</motion.span>)}</div>
    </div>
  );

  if (step === 2) {
    const examples = zh ? ["抓地与启动", "缓震与支撑", "室外与耐磨"] : ["Traction & speed", "Cushion & support", "Outdoor durability"];
    return <div className={styles.scene}>
      <div className={styles.demoLabel}>{zh ? "交互演示 · 不会替换你的草稿" : "INTERACTIVE DEMO · YOUR DRAFT IS SAFE"}</div>
      <div className={styles.exampleChoices}>{examples.map((label, index) => <motion.button {...enter(index * 0.12)} key={label} type="button" onClick={() => { touched.current = true; setChosen(index); }} className={chosen === index ? styles.chosenExample : ""} aria-pressed={chosen === index}>{label}{chosen === index && <motion.span layoutId="ai-demo-example-check"><Check size={13} /></motion.span>}</motion.button>)}</div>
      <AnimatePresence mode="wait" initial={false}><motion.p key={chosen} initial={{ opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }} className={styles.exampleSentence}>{zh ? ["“我经常变向突破，想要抓地好、启动利落的球鞋。”", "“我更在意落地缓震，以及侧向移动时的稳定支撑。”", "“我主要打室外场，希望外底耐磨，脚感舒适。”"][chosen] : ["“I change direction a lot and want dependable traction with a quick feel.”", "“I care about landing cushioning and stable support on lateral moves.”", "“I play outdoors and want a durable outsole with a comfortable feel.”"][chosen]}</motion.p></AnimatePresence>
    </div>;
  }

  if (step === 3) return <div className={styles.scene}>
    <div className={styles.demoLabel}>{realResult ? (zh ? "下方已高亮你的推荐卡片" : "YOUR RECOMMENDATION IS HIGHLIGHTED") : (zh ? "推荐结构演示 · 不是真实推荐结果" : "LAYOUT DEMO · NOT AN ACTUAL RECOMMENDATION")}</div>
    <motion.div {...enter(0.05)} className={styles.resultDemo}><div className={styles.resultShoe}><ShoeDrawing /></div><div className={styles.resultText}><span>{zh ? "为什么推荐它" : "Why it might work"}</span><p>{zh ? "把球鞋特点与你的需求对应起来。" : "See how the shoe relates to your needs."}</p><div className={styles.resultActions}><motion.span {...enter(0.7)}>{zh ? "详细分析" : "Details"}<ArrowRight size={12} /></motion.span><motion.span {...enter(1.1)}><GitCompareArrows size={12} />{zh ? "加入对比" : "Compare"}</motion.span></div></div></motion.div>
  </div>;

  return <div className={`${styles.scene} ${styles.finishScene}`}>
    <motion.div {...enter(0.08)} className={styles.sendOrb}><motion.span animate={reduced ? undefined : { y: [6, 0], opacity: [0, 1] }} transition={{ delay: 0.25, duration: 0.5, ease: EASE }}><ArrowUp size={32} strokeWidth={1.8} /></motion.span></motion.div>
    <motion.p {...enter(0.5)}>{zh ? "你的需求。你的选择。" : "Your needs. Your choice."}</motion.p>
    <motion.small {...enter(0.8)}>{zh ? "本次指导没有发送消息，也没有使用任何 AI 额度。" : "This guide hasn't sent a message or used any AI credits."}</motion.small>
  </div>;
}
