"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, ChevronDown, Plus, Share2 } from "lucide-react";
import { ComparePlinths } from "@/components/compare/compare-plinths";
import { CompareRadar } from "@/components/compare/compare-radar";
import { CompareDiffRows } from "@/components/compare/compare-diff-rows";
import { CompareSpecTable } from "@/components/compare/compare-spec-table";
import { useLocale } from "@/components/i18n/locale-provider";
import { Shoe } from "@/lib/types";

const EASE = "cubic-bezier(0.22,1,0.36,1)";
const SLIDE_TRANSITION_MS = 720;
const SCROLL_DELTA_THRESHOLD = 14;
const TOUCH_DELTA_THRESHOLD = 48;

function trySelfScroll(el: HTMLElement | null, deltaY: number): boolean {
  if (!el) return false;
  if (el.scrollHeight <= el.clientHeight) return false;
  const atTop = el.scrollTop <= 0;
  const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
  if (deltaY > 0 && !atBottom) return true;
  if (deltaY < 0 && !atTop) return true;
  return false;
}

type Props = {
  shoes: Shoe[];
  canAdd: boolean;
  canSave: boolean;
  canShare: boolean;
  onAdd: () => void;
  onSave: () => void;
  onShare: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
};

export function CompareSlides({ shoes, canAdd, canSave, canShare, onAdd, onSave, onShare, onRemove, onClear }: Props) {
  const { translate } = useLocale();
  const TOTAL = 3;
  const [slide, setSlide] = useState(0);
  const [showRatingDetail, setShowRatingDetail] = useState(false);
  const slideRef = useRef(0);
  const animatingRef = useRef(false);

  useEffect(() => {
    slideRef.current = slide;
  }, [slide]);

  const goTo = useCallback((next: number) => {
    if (animatingRef.current) return;
    if (next < 0 || next >= TOTAL) return;
    if (next === slideRef.current) return;
    animatingRef.current = true;
    setSlide(next);
    window.setTimeout(() => {
      animatingRef.current = false;
    }, SLIDE_TRANSITION_MS);
  }, []);

  // Wheel navigation — capture at window; let nested scroll containers handle their own scroll.
  useEffect(() => {
    let lastFire = 0;
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      const sc = target?.closest("[data-compare-scroll-container]") as HTMLElement | null;
      if (sc && trySelfScroll(sc, e.deltaY)) return;
      const now = Date.now();
      if (now - lastFire < 80) return;
      if (Math.abs(e.deltaY) < SCROLL_DELTA_THRESHOLD) return;
      e.preventDefault();
      lastFire = now;
      if (e.deltaY > 0) goTo(slideRef.current + 1);
      else goTo(slideRef.current - 1);
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [goTo]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "PageDown") {
        e.preventDefault();
        goTo(slideRef.current + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        goTo(slideRef.current - 1);
      } else if (e.key === "Home") {
        goTo(0);
      } else if (e.key === "End") {
        goTo(TOTAL - 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo]);

  // Touch
  useEffect(() => {
    let startY = 0;
    let scroller: HTMLElement | null = null;
    const onStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement | null;
      scroller = target?.closest("[data-compare-scroll-container]") as HTMLElement | null;
      startY = e.touches[0]?.clientY ?? 0;
    };
    const onEnd = (e: TouchEvent) => {
      const endY = e.changedTouches[0]?.clientY ?? 0;
      const dy = startY - endY;
      if (Math.abs(dy) < TOUCH_DELTA_THRESHOLD) return;
      if (scroller && trySelfScroll(scroller, dy)) return;
      if (dy > 0) goTo(slideRef.current + 1);
      else goTo(slideRef.current - 1);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [goTo]);

  // Lock body scroll while slides are active.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const labels = [translate("Lineup"), translate("Profile"), translate("Specs")];

  const slideHeight = "calc(100dvh - var(--top-nav-h, 64px) - var(--mobile-nav-h, 0px))";

  return (
    <div className="relative" style={{ height: slideHeight, overflow: "hidden" }}>
      {/* Slide track */}
      <div
        className="flex flex-col"
        style={{
          transform: `translate3d(0, calc(${-slide} * ${slideHeight}), 0)`,
          transition: `transform ${SLIDE_TRANSITION_MS}ms ${EASE}`,
          willChange: "transform",
          backfaceVisibility: "hidden"
        }}
      >
        {/* Slide 0: Hero + Plinths */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <div
            className="container-shell h-full overflow-y-auto py-6 md:py-8"
            data-compare-scroll-container
          >
            <div className="flex min-h-full flex-col justify-center">
              <HeroBlock
                shoes={shoes}
                canAdd={canAdd}
                canSave={canSave}
                canShare={canShare}
                onAdd={onAdd}
                onSave={onSave}
                onShare={onShare}
                onClear={onClear}
                showRatingDetail={showRatingDetail}
                onToggleRatingDetail={() => setShowRatingDetail((v) => !v)}
                translate={translate}
              />
              <div className="mt-6 md:mt-10">
                <ComparePlinths
                  shoes={shoes}
                  onRemove={onRemove}
                  onAdd={onAdd}
                  canAdd={canAdd}
                  showRatingDetail={showRatingDetail}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Slide 1: Performance Profile */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <div
            className="container-shell h-full overflow-y-auto py-6 md:py-10"
            data-compare-scroll-container
          >
            <div className="flex min-h-full flex-col justify-center">
              <p className="t-eyebrow mb-6 text-center">{translate("Performance Profile")}</p>
              <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-14">
                <CompareRadar shoes={shoes} />
                <CompareDiffRows shoes={shoes} />
              </div>
            </div>
          </div>
        </div>

        {/* Slide 2: Tech Specifications */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <div className="container-shell flex h-full flex-col justify-center py-6 md:py-10">
            <div className="flex min-h-0 flex-col">
              <p className="t-eyebrow mb-5 shrink-0 text-center">{translate("Tech Specifications")}</p>
              <div className="min-h-0 flex-1 overflow-y-auto" data-compare-scroll-container>
                <CompareSpecTable shoes={shoes} active={slide === 2} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right-side indicator */}
      <div
        className="pointer-events-none absolute right-5 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-2 md:flex"
        aria-hidden
      >
        <span
          key={slide}
          className="mb-1 select-none text-[0.55rem] font-medium uppercase tracking-[0.22em]"
          style={{
            color: "rgb(var(--subtext)/0.55)",
            writingMode: "vertical-rl",
            textOrientation: "mixed",
            animation: `slideLabelIn 380ms ${EASE}`
          }}
        >
          {labels[slide]}
        </span>
        {Array.from({ length: TOTAL }).map((_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => goTo(i)}
            aria-label={`Slide ${i + 1}: ${labels[i]}`}
            className="pointer-events-auto rounded-sm border-none p-0 outline-none"
            style={{
              width: 4,
              height: slide === i ? 22 : 4,
              background: slide === i ? "rgb(var(--text)/0.8)" : "rgb(var(--muted)/0.55)",
              boxShadow: slide === i ? "0 0 0 4px rgb(var(--text)/0.08)" : "none",
              transition: `height 320ms ${EASE},background 220ms ${EASE},box-shadow 320ms ${EASE}`,
              cursor: "pointer"
            }}
          />
        ))}
      </div>

      {/* Scroll-down affordance — visible on any slide except the last */}
      <button
        type="button"
        onClick={() => goTo(slide + 1)}
        aria-label={translate("Scroll to next slide")}
        className="absolute left-1/2 z-10 -translate-x-1/2 items-center justify-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.45)] bg-[rgb(var(--bg-elev)/0.7)] text-[rgb(var(--subtext))] shadow-[0_4px_14px_rgb(var(--shadow)/0.18)] backdrop-blur-[12px] transition-[opacity,transform,color] duration-[320ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:text-[rgb(var(--text))]"
        style={{
          bottom: 32,
          width: 36,
          height: 36,
          display: slide < TOTAL - 1 ? "inline-flex" : "none",
          opacity: slide < TOTAL - 1 ? 1 : 0,
          transform: `translateX(-50%) translateY(${slide < TOTAL - 1 ? "0" : "8px"})`
        }}
      >
        <ChevronDown
          className="h-4 w-4"
          style={{
            animation: "scrollHint 1.8s ease-in-out infinite"
          }}
        />
      </button>

      <style>{`
        @keyframes scrollHint {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(3px); opacity: 1; }
        }
        @keyframes slideLabelIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function HeroBlock({
  shoes,
  canAdd,
  canSave,
  canShare,
  onAdd,
  onSave,
  onShare,
  onClear,
  showRatingDetail,
  onToggleRatingDetail,
  translate
}: {
  shoes: Shoe[];
  canAdd: boolean;
  canSave: boolean;
  canShare: boolean;
  onAdd: () => void;
  onSave: () => void;
  onShare: () => void;
  onClear: () => void;
  showRatingDetail: boolean;
  onToggleRatingDetail: () => void;
  translate: (value: string) => string;
}) {
  return (
    <div className="text-center">
      <p className="t-eyebrow mb-2">{translate("Head to Head")}</p>
      <h1
        className="font-extrabold leading-[1] tracking-[-0.04em]"
        style={{ fontSize: "clamp(2.2rem, 4.5vw, 3.8rem)" }}
      >
        {translate("Compare")}
      </h1>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
        <p className="text-[0.85rem] tracking-[-0.005em] soft-text">
          {shoes.map((shoe, i) => (
            <span key={shoe.id}>
              <span className="text-[rgb(var(--text)/0.9)]">{shoe.shoe_name}</span>
              {i < shoes.length - 1 ? <span className="mx-2 opacity-40">/</span> : null}
            </span>
          ))}
        </p>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canAdd}
          className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[rgb(var(--glass-stroke-soft)/0.4)] disabled:hover:text-[rgb(var(--subtext))]"
        >
          <Plus className="h-3.5 w-3.5" /> {translate("Add shoe")}
        </button>
        {canSave ? (
          <button
            type="button"
            onClick={onSave}
            className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]"
          >
            <Bookmark className="h-3.5 w-3.5" /> {translate("Save compare")}
          </button>
        ) : null}
        {canShare ? (
          <button
            type="button"
            onClick={onShare}
            className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]"
          >
            <Share2 className="h-3.5 w-3.5" /> {translate("Share card")}
          </button>
        ) : null}
        <button
          type="button"
          onClick={onToggleRatingDetail}
          className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--glass-stroke-soft)/0.4)] px-2.5 py-1 text-[0.75rem] soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]"
        >
          {translate(showRatingDetail ? "Hide ratings detail" : "Show ratings detail")}
        </button>
        <button
          type="button"
          onClick={onClear}
          className="rounded-md border border-transparent px-2 py-1 text-[0.72rem] soft-text transition hover:text-[rgb(var(--text))]"
        >
          {translate("Clear all")}
        </button>
      </div>
    </div>
  );
}
