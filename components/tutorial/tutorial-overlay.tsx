"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { useTutorial } from "@/components/tutorial/tutorial-provider";
import { TUTORIAL_STEPS, type TutorialStep } from "@/lib/tutorial/steps";
import { useLocale } from "@/components/i18n/locale-provider";

type Rect = { x: number; y: number; w: number; h: number };

const CARD_W = 340;
const CARD_H_EST = 210;
const SPOTLIGHT_PAD = 8;
const CARD_GAP = 16;

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function getRect(selector: string): Rect | null {
  const el = document.querySelector(selector) as HTMLElement | null;
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

export function TutorialOverlay() {
  const { active, stepIndex, totalSteps, next, prev, stop, goTo } = useTutorial();
  const { translate, locale, requestLocaleChange } = useLocale();
  const pathname = usePathname();

  const [mounted, setMounted] = useState(false);
  const [vw, setVw] = useState(0);
  const [vh, setVh] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [missingTarget, setMissingTarget] = useState(false);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const step: TutorialStep | undefined = TUTORIAL_STEPS[stepIndex];
  const isFinalStep = stepIndex === totalSteps - 1;

  // Dispatch slide change when step requires it
  useEffect(() => {
    if (!active || !step) return;
    if (step.requiresSlide === undefined) return;
    window.dispatchEvent(
      new CustomEvent("tutorial:goto-slide", { detail: { slide: step.requiresSlide } })
    );
  }, [active, step]);

  // Viewport tracking
  useEffect(() => {
    if (!active) return;
    const update = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [active]);

  // Continuous rAF rect tracking (handles slide transitions, layout shifts)
  useLayoutEffect(() => {
    if (!active || !step) return;

    if (!step.selector || step.placement === "center") {
      setRect(null);
      setMissingTarget(false);
      return;
    }

    // Path mismatch — show missing-target hint immediately.
    if (step.requiresPath && pathname !== step.requiresPath) {
      setRect(null);
      setMissingTarget(true);
      return;
    }

    let consecutiveMisses = 0;
    let scrolled = false;

    const loop = () => {
      const r = getRect(step.selector!);
      if (r) {
        consecutiveMisses = 0;
        setRect((prevRect) => {
          if (
            prevRect &&
            Math.abs(prevRect.x - r.x) < 0.5 &&
            Math.abs(prevRect.y - r.y) < 0.5 &&
            Math.abs(prevRect.w - r.w) < 0.5 &&
            Math.abs(prevRect.h - r.h) < 0.5
          ) {
            return prevRect;
          }
          return r;
        });
        setMissingTarget(false);

        if (!scrolled && step.scrollIntoView !== false) {
          const el = document.querySelector(step.selector!) as HTMLElement | null;
          if (el) {
            const er = el.getBoundingClientRect();
            if (er.top < 80 || er.bottom > window.innerHeight - 80) {
              el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }
          scrolled = true;
        }
      } else {
        consecutiveMisses += 1;
        if (consecutiveMisses > 90) {
          setRect(null);
          setMissingTarget(true);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [active, step, pathname]);

  // Keyboard navigation
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        stop();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, prev, stop]);

  // Lock user-initiated scroll/swipe/slide-nav while the tour is active. The
  // tour's own `scrollIntoView` calls still work because they don't go through
  // these listeners. Touches inside the tutorial card are allowed so its
  // buttons remain tappable.
  useEffect(() => {
    if (!active) return;

    const isInCard = (target: EventTarget | null): boolean =>
      !!(target as HTMLElement | null)?.closest?.(".tutorial-card");

    const blockWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const blockTouchMove = (e: TouchEvent) => {
      if (isInCard(e.target)) return;
      if (e.cancelable) e.preventDefault();
      e.stopPropagation();
    };

    const blockTouchEnds = (e: TouchEvent) => {
      if (isInCard(e.target)) return;
      e.stopPropagation();
    };

    const SCROLL_KEYS = new Set([
      "ArrowUp",
      "ArrowDown",
      "PageUp",
      "PageDown",
      "Home",
      "End",
      " ",
      "Spacebar"
    ]);

    const blockKeys = (e: KeyboardEvent) => {
      if (SCROLL_KEYS.has(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("wheel", blockWheel, { capture: true, passive: false });
    window.addEventListener("touchstart", blockTouchEnds, { capture: true });
    window.addEventListener("touchmove", blockTouchMove, { capture: true, passive: false });
    window.addEventListener("touchend", blockTouchEnds, { capture: true });
    window.addEventListener("keydown", blockKeys, { capture: true });

    return () => {
      window.removeEventListener("wheel", blockWheel, true);
      window.removeEventListener("touchstart", blockTouchEnds, true);
      window.removeEventListener("touchmove", blockTouchMove, true);
      window.removeEventListener("touchend", blockTouchEnds, true);
      window.removeEventListener("keydown", blockKeys, true);
    };
  }, [active]);

  const padding = step?.padding ?? SPOTLIGHT_PAD;
  const radius = step?.radius ?? 14;

  const hole = useMemo<Rect | null>(() => {
    if (!rect) return null;
    return {
      x: rect.x - padding,
      y: rect.y - padding,
      w: rect.w + padding * 2,
      h: rect.h + padding * 2
    };
  }, [rect, padding]);

  const cornerRadius = useMemo(() => {
    if (!hole) return radius;
    if (step?.shape === "circle") return Math.max(hole.w, hole.h) / 2;
    return radius;
  }, [hole, radius, step]);

  const cardPos = useMemo(() => {
    if (!step) return { left: 0, top: 0, placement: "center" as const };

    if (!hole || step.placement === "center" || missingTarget) {
      return {
        left: clamp(vw / 2 - CARD_W / 2, 16, Math.max(16, vw - CARD_W - 16)),
        top: clamp(vh / 2 - CARD_H_EST / 2, 16, Math.max(16, vh - CARD_H_EST - 16)),
        placement: "center" as const
      };
    }

    const preferred = step.placement ?? "bottom";
    type Side = "top" | "bottom" | "left" | "right";

    const tryPlace = (p: Side) => {
      let left = 0;
      let top = 0;
      if (p === "bottom") {
        top = hole.y + hole.h + CARD_GAP;
        left = hole.x + hole.w / 2 - CARD_W / 2;
      } else if (p === "top") {
        top = hole.y - CARD_H_EST - CARD_GAP;
        left = hole.x + hole.w / 2 - CARD_W / 2;
      } else if (p === "right") {
        left = hole.x + hole.w + CARD_GAP;
        top = hole.y + hole.h / 2 - CARD_H_EST / 2;
      } else {
        left = hole.x - CARD_W - CARD_GAP;
        top = hole.y + hole.h / 2 - CARD_H_EST / 2;
      }
      const fits =
        left >= 8 && top >= 8 && left + CARD_W <= vw - 8 && top + CARD_H_EST <= vh - 8;
      return { left, top, fits };
    };

    const order: Side[] =
      preferred === "bottom"
        ? ["bottom", "top", "right", "left"]
        : preferred === "top"
          ? ["top", "bottom", "right", "left"]
          : preferred === "right"
            ? ["right", "left", "bottom", "top"]
            : ["left", "right", "bottom", "top"];

    for (const p of order) {
      const r = tryPlace(p);
      if (r.fits) {
        return {
          left: clamp(r.left, 8, Math.max(8, vw - CARD_W - 8)),
          top: clamp(r.top, 8, Math.max(8, vh - CARD_H_EST - 8)),
          placement: p
        };
      }
    }

    return {
      left: clamp(vw / 2 - CARD_W / 2, 16, Math.max(16, vw - CARD_W - 16)),
      top: clamp(vh / 2 - CARD_H_EST / 2, 16, Math.max(16, vh - CARD_H_EST - 16)),
      placement: "center" as const
    };
  }, [hole, step, vw, vh, missingTarget]);

  if (!mounted || !active || !step) return null;

  const showSpotlight = !!hole && !missingTarget;

  const blockerStyle: React.CSSProperties = {
    background: "transparent",
    cursor: "default"
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={translate("Site tour")}>
      {/* Visual layer — dimmer + spotlight outline */}
      <svg
        className="fixed inset-0"
        style={{
          width: "100vw",
          height: "100vh",
          zIndex: 60,
          pointerEvents: "none"
        }}
        aria-hidden
      >
        <defs>
          <mask id="snkrf-tutorial-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {showSpotlight && hole && (
              <rect
                x={hole.x}
                y={hole.y}
                width={hole.w}
                height={hole.h}
                rx={cornerRadius}
                ry={cornerRadius}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgb(8,8,10)"
          fillOpacity={missingTarget ? 0.78 : 0.62}
          mask="url(#snkrf-tutorial-mask)"
          style={{ transition: "fill-opacity 280ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        {showSpotlight && hole && (
          <>
            <rect
              x={hole.x - 1.5}
              y={hole.y - 1.5}
              width={hole.w + 3}
              height={hole.h + 3}
              rx={cornerRadius + 1.5}
              ry={cornerRadius + 1.5}
              fill="none"
              stroke="rgb(255,255,255)"
              strokeOpacity="0.92"
              strokeWidth="1.25"
              style={{
                filter: "drop-shadow(0 0 16px rgba(255,255,255,0.22))",
                transition:
                  "x 360ms cubic-bezier(0.22,1,0.36,1), y 360ms cubic-bezier(0.22,1,0.36,1), width 360ms cubic-bezier(0.22,1,0.36,1), height 360ms cubic-bezier(0.22,1,0.36,1)"
              }}
            />
            <rect
              x={hole.x - 6}
              y={hole.y - 6}
              width={hole.w + 12}
              height={hole.h + 12}
              rx={cornerRadius + 6}
              ry={cornerRadius + 6}
              fill="none"
              stroke="rgb(255,255,255)"
              strokeOpacity="0.16"
              strokeWidth="1"
              style={{
                transition:
                  "x 360ms cubic-bezier(0.22,1,0.36,1), y 360ms cubic-bezier(0.22,1,0.36,1), width 360ms cubic-bezier(0.22,1,0.36,1), height 360ms cubic-bezier(0.22,1,0.36,1)"
              }}
            />
          </>
        )}
      </svg>

      {/* Full-screen click blocker — keeps the tour from being broken by stray clicks. */}
      <div className="fixed inset-0" style={{ zIndex: 61, ...blockerStyle }} />


      {/* Card */}
      <div
        key={step.id}
        className="glass-card tutorial-card"
        style={{
          position: "fixed",
          left: cardPos.left,
          top: cardPos.top,
          width: CARD_W,
          maxWidth: "calc(100vw - 24px)",
          zIndex: 63,
          padding: "18px 18px 14px 18px",
          borderRadius: 20,
          color: "rgb(var(--text))"
        }}
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[0.6rem] font-medium uppercase tracking-[0.22em] text-[rgb(var(--subtext))]">
            {translate("Tour")} · {stepIndex + 1} / {totalSteps}
          </span>
          <button
            type="button"
            onClick={stop}
            aria-label={translate("Close tour")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[rgb(var(--subtext))] transition hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <h3 className="text-[1.05rem] font-semibold tracking-[-0.018em]">
          {translate(step.title)}
        </h3>
        <p className="mt-1.5 text-[0.86rem] leading-[1.5] text-[rgb(var(--subtext))]">
          {translate(step.body)}
        </p>

        {stepIndex === 0 ? (
          <div className="mt-3 flex items-center gap-1.5">
            <span className="text-[0.68rem] font-medium uppercase tracking-[0.16em] text-[rgb(var(--subtext))]">
              {translate("Language")}
            </span>
            <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)]">
              <button
                type="button"
                onClick={() => requestLocaleChange("en")}
                aria-pressed={locale === "en"}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[0.74rem] font-medium transition"
                style={{
                  background:
                    locale === "en" ? "rgb(var(--text)/0.92)" : "transparent",
                  color:
                    locale === "en"
                      ? "rgb(var(--bg))"
                      : "rgb(var(--subtext))"
                }}
                data-translation-lock="true"
              >
                {locale === "en" ? <Check className="h-3 w-3" /> : null}
                English
              </button>
              <button
                type="button"
                onClick={() => requestLocaleChange("zh")}
                aria-pressed={locale === "zh"}
                className="inline-flex items-center gap-1 border-l border-[rgb(var(--glass-stroke-soft)/0.55)] px-2.5 py-1 text-[0.74rem] font-medium transition"
                style={{
                  background:
                    locale === "zh" ? "rgb(var(--text)/0.92)" : "transparent",
                  color:
                    locale === "zh"
                      ? "rgb(var(--bg))"
                      : "rgb(var(--subtext))"
                }}
                data-translation-lock="true"
              >
                {locale === "zh" ? <Check className="h-3 w-3" /> : null}
                中文
              </button>
            </div>
          </div>
        ) : null}

        {missingTarget && step.selector ? (
          <div className="mt-3 rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] px-3 py-2 text-[0.78rem] leading-snug text-[rgb(var(--subtext))]">
            {translate("This part lives on the homepage.")}{" "}
            <Link
              href="/"
              className="font-medium text-[rgb(var(--text))] underline-offset-2 hover:underline"
            >
              {translate("Return home")}
            </Link>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1">
            {TUTORIAL_STEPS.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`${translate("Step")} ${i + 1}`}
                onClick={() => goTo(i)}
                className="h-1 rounded-full transition-[background-color,width] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{
                  width: i === stepIndex ? 16 : 4,
                  background:
                    i === stepIndex
                      ? "rgb(var(--text)/0.85)"
                      : i < stepIndex
                        ? "rgb(var(--text)/0.4)"
                        : "rgb(var(--muted)/0.7)"
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={prev}
            disabled={stepIndex === 0}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.55)] text-[rgb(var(--subtext))] transition hover:border-[rgb(var(--text)/0.35)] hover:text-[rgb(var(--text))] disabled:cursor-not-allowed disabled:opacity-40"
            aria-label={translate("Previous step")}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={next}
            className="shimmer-on-hover relative inline-flex h-8 items-center justify-center gap-1 overflow-hidden rounded-lg border border-[rgb(var(--text))] bg-[rgb(var(--text))] px-3 text-[0.78rem] font-semibold tracking-[-0.005em] text-[rgb(var(--bg))] transition-[transform,box-shadow] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-[1px] hover:shadow-[0_8px_20px_rgb(var(--shadow)/0.35)]"
          >
            <span className="relative z-10 inline-flex items-center gap-1">
              {isFinalStep ? translate("Finish") : translate("Next")}
              {isFinalStep ? <Check className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
            </span>
          </button>
        </div>
      </div>

      <style>{`
        .tutorial-card {
          animation: tutorialCardPop 260ms cubic-bezier(0.22,1,0.36,1);
        }
        @keyframes tutorialCardPop {
          from { opacity: 0; transform: translateY(6px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tutorial-card { animation: none; }
        }
      `}</style>
    </div>,
    document.body
  );
}
