"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/ui/turnstile";
import { useLocale } from "@/components/i18n/locale-provider";

const EASE = "cubic-bezier(0.22,1,0.36,1)";
const SLIDE_TRANSITION_MS = 720;
const TOTAL = 4;

export type SubmissionSlidesHandle = {
  goTo: (index: number) => void;
};

type FieldDef = {
  name: string;
  label: string;
  required?: boolean;
  type?: "text" | "number";
};

const IDENTITY_FIELDS: FieldDef[] = [
  { name: "shoe_name", label: "Shoe name", required: true },
  { name: "brand", label: "Brand", required: true },
  { name: "model", label: "Model / version" },
  { name: "release_year", label: "Release year", type: "number" }
];

const TECH_FIELDS: FieldDef[] = [
  { name: "forefoot_midsole_tech", label: "Forefoot midsole tech" },
  { name: "heel_midsole_tech", label: "Heel midsole tech" },
  { name: "outsole_tech", label: "Outsole tech" },
  { name: "upper_tech", label: "Upper tech" }
];

const FEEL_FIELDS: FieldDef[] = [
  { name: "cushioning_feel", label: "Cushioning feel" },
  { name: "court_feel", label: "Court feel" },
  { name: "bounce", label: "Bounce" },
  { name: "stability", label: "Stability" },
  { name: "traction", label: "Traction" },
  { name: "fit", label: "Fit / containment" }
];

type Props = {
  mode: "new_shoe" | "correction";
  targetShoeLabel?: string;
  initialValues: Record<string, string | number | null | undefined>;
  token: string;
  onToken: (token: string) => void;
  isSubmitting: boolean;
  message: string;
  isError: boolean;
};

export const SubmissionSlides = forwardRef<SubmissionSlidesHandle, Props>(function SubmissionSlides(
  { mode, targetShoeLabel, initialValues, token, onToken, isSubmitting, message, isError },
  ref
) {
  const { translate } = useLocale();
  const [slide, setSlide] = useState(0);
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

  useImperativeHandle(ref, () => ({ goTo }), [goTo]);

  // Step navigation is intentionally limited to the Next/Back buttons only.
  // Wheel / touch-swipe / keyboard slide-navigation listeners were removed so a
  // stray scroll or swipe can never change the step. Each step's inner
  // `overflow-y-auto` container still scrolls its own long content normally.

  useBodyScrollLock();

  const labels = [translate("Identity"), translate("Tech"), translate("Feel"), translate("Story")];
  const slideHeight = "calc(100dvh - var(--top-nav-h, 64px) - var(--mobile-nav-h, 0px))";

  function valueOf(name: string) {
    const v = initialValues[name];
    return v == null ? "" : String(v);
  }

  return (
    <div className="relative" style={{ height: slideHeight, overflow: "hidden" }}>
      <div
        className="flex flex-col"
        style={{
          transform: `translate3d(0, calc(${-slide} * ${slideHeight}), 0)`,
          transition: `transform ${SLIDE_TRANSITION_MS}ms ${EASE}`,
          willChange: "transform",
          backfaceVisibility: "hidden"
        }}
      >
        {/* Slide 0: Identity */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <StepScrollArea className="container-shell h-full overflow-y-auto py-6 md:py-10">
            <div className="flex min-h-full flex-col justify-center">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                <SlideHeader
                  eyebrow={translate("Step 1 of 4")}
                  title={mode === "correction" ? translate("Submit correction") : translate("Submit sneaker information")}
                  description={
                    mode === "correction"
                      ? `${translate("You're submitting a correction for")} ${targetShoeLabel ?? translate("an existing published shoe")}. ${translate("This goes to the same review queue and approval will update the existing record.")}`
                      : translate("Let's start with what shoe this is.")
                  }
                />
                <FieldGrid fields={IDENTITY_FIELDS} valueOf={valueOf} translate={translate} cols={2} />
                <SlideNav
                  slide={slide}
                  total={TOTAL}
                  goTo={goTo}
                  translate={translate}
                  isSubmitting={isSubmitting}
                />
              </div>
            </div>
          </StepScrollArea>
        </div>

        {/* Slide 1: Tech */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <StepScrollArea className="container-shell h-full overflow-y-auto py-6 md:py-10">
            <div className="flex min-h-full flex-col justify-center">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                <SlideHeader
                  eyebrow={translate("Step 2 of 4")}
                  title={translate("Tech")}
                  description={translate("Materials and construction details. All optional.")}
                />
                <FieldGrid fields={TECH_FIELDS} valueOf={valueOf} translate={translate} cols={2} />
                <SlideNav
                  slide={slide}
                  total={TOTAL}
                  goTo={goTo}
                  translate={translate}
                  isSubmitting={isSubmitting}
                />
              </div>
            </div>
          </StepScrollArea>
        </div>

        {/* Slide 2: Feel */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <StepScrollArea className="container-shell h-full overflow-y-auto py-6 md:py-10">
            <div className="flex min-h-full flex-col justify-center">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
                <SlideHeader
                  eyebrow={translate("Step 3 of 4")}
                  title={translate("Feel")}
                  description={translate("Subjective performance qualities, in your own words.")}
                />
                <FieldGrid fields={FEEL_FIELDS} valueOf={valueOf} translate={translate} cols={3} />
                <SlideNav
                  slide={slide}
                  total={TOTAL}
                  goTo={goTo}
                  translate={translate}
                  isSubmitting={isSubmitting}
                />
              </div>
            </div>
          </StepScrollArea>
        </div>

        {/* Slide 3: Story + Submit */}
        <div className="shrink-0 overflow-hidden" style={{ height: slideHeight }}>
          <div className="container-shell flex h-full flex-col py-6 md:py-10">
            <StepScrollArea className="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col gap-5 overflow-y-auto pr-1">
              <SlideHeader
                eyebrow={translate("Step 4 of 4")}
                title={translate("Story")}
                description={translate("Add story + raw notes + verification, then submit.")}
              />
              <div>
                <label className="mb-1 block text-xs soft-text">{translate("Story title")}</label>
                <Input
                  name="story_title"
                  defaultValue={valueOf("story_title")}
                  placeholder={translate("Short headline for the story.")}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs soft-text">{translate("Story / background notes")}</label>
                <textarea
                  name="story_notes"
                  defaultValue={valueOf("story_notes")}
                  className="min-h-24 w-full rounded-xl border border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.78)] p-3 text-sm text-[rgb(var(--text))] outline-none transition focus:border-[rgb(var(--ring)/0.8)] focus:ring-4 focus:ring-[rgb(var(--ring)/0.16)]"
                  placeholder={translate("Release context, design intent, notable versions, community notes.")}
                />
              </div>
              <div>
                <label className="mb-1 flex items-center gap-2 text-xs soft-text">
                  <span
                    aria-hidden
                    className="inline-block h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent))]"
                  />
                  {translate("Raw notes (required)")}
                </label>
                <textarea
                  name="raw_text"
                  defaultValue={valueOf("raw_text")}
                  className="min-h-32 w-full rounded-xl border border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.78)] p-3 text-sm text-[rgb(var(--text))] outline-none transition focus:border-[rgb(var(--ring)/0.8)] focus:ring-4 focus:ring-[rgb(var(--ring)/0.16)]"
                  placeholder={translate("Paste your full performance observations and source snippets...")}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs soft-text">{translate("Tags (comma separated)")}</label>
                  <Input
                    name="tags"
                    defaultValue={valueOf("tags")}
                    placeholder={translate("Tags (comma separated)")}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs soft-text">{translate("Source links (comma separated)")}</label>
                  <Input
                    name="source_links"
                    defaultValue={valueOf("source_links")}
                    placeholder={translate("Source links (comma separated)")}
                  />
                </div>
              </div>
              <div className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.5)] p-3">
                <TurnstileWidget onToken={onToken} />
              </div>
              <div className="flex flex-col items-stretch gap-3 pt-1 sm:flex-row sm:items-center">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => goTo(slide - 1)}
                  className="w-full sm:w-auto"
                >
                  {translate("Back")}
                </Button>
                <Button type="submit" className="w-full sm:w-auto" disabled={isSubmitting}>
                  {isSubmitting ? translate("Submitting...") : translate("Submit for review")}
                </Button>
                {message && isError && <p className="text-xs text-red-400">{message}</p>}
                {!token && (
                  <p className="text-[11px] soft-text">{translate("Complete verification above to enable submit.")}</p>
                )}
              </div>
            </StepScrollArea>
          </div>
        </div>
      </div>

      {/* Right-side dot indicator */}
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
            animation: `slideLabelInSubmit 380ms ${EASE}`
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

      {/* Scroll-down chevron, hidden on the final slide */}
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
          style={{ animation: "scrollHintSubmit 1.8s ease-in-out infinite" }}
        />
      </button>

      <style>{`
        @keyframes scrollHintSubmit {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50% { transform: translateY(3px); opacity: 1; }
        }
        @keyframes slideLabelInSubmit {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
});

/**
 * Scrollable step body. Keeps its own `overflow-y-auto` so long content scrolls,
 * and shows a bottom fade + down-chevron "more below" hint while the content
 * overflows and is not yet scrolled to the bottom.
 */
function StepScrollArea({
  className,
  children
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = useState(false);

  const recompute = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const overflowing = el.scrollHeight > el.clientHeight + 1;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    setShowHint(overflowing && !atBottom);
  }, []);

  useEffect(() => {
    recompute();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", recompute, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recompute) : null;
    if (ro) ro.observe(el);
    window.addEventListener("resize", recompute);
    return () => {
      el.removeEventListener("scroll", recompute);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [recompute]);

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className={className} data-submission-scroll-container>
        {children}
      </div>
      {/* "more below" affordance — fade + animated down-chevron */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-2 transition-opacity duration-300"
        style={{ opacity: showHint ? 1 : 0 }}
      >
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[rgb(var(--bg))] to-transparent" />
        <div className="relative flex h-7 w-7 items-center justify-center rounded-full border border-[rgb(var(--glass-stroke-soft)/0.45)] bg-[rgb(var(--bg-elev)/0.7)] text-[rgb(var(--subtext))] shadow-[0_4px_14px_rgb(var(--shadow)/0.18)] backdrop-blur-[12px]">
          <ChevronDown className="h-4 w-4" style={{ animation: "scrollHintSubmit 1.8s ease-in-out infinite" }} />
        </div>
      </div>
    </div>
  );
}

function SlideHeader({
  eyebrow,
  title,
  description
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2 text-center">
      <p className="t-eyebrow">{eyebrow}</p>
      <h1
        className="font-extrabold leading-[1] tracking-[-0.04em]"
        style={{ fontSize: "clamp(1.8rem, 3.6vw, 2.8rem)" }}
      >
        {title}
      </h1>
      <p className="text-sm soft-text">{description}</p>
    </div>
  );
}

function FieldGrid({
  fields,
  valueOf,
  translate,
  cols
}: {
  fields: FieldDef[];
  valueOf: (name: string) => string;
  translate: (s: string) => string;
  cols: 1 | 2 | 3;
}) {
  const colsClass = cols === 3 ? "md:grid-cols-3" : cols === 2 ? "md:grid-cols-2" : "";
  return (
    <div className={`grid gap-4 ${colsClass}`}>
      {fields.map((f) => (
        <div key={f.name}>
          <label className="mb-1 flex items-center gap-2 text-xs soft-text">
            {f.required && (
              <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent))]" />
            )}
            {translate(f.label)}
          </label>
          <Input
            name={f.name}
            type={f.type ?? "text"}
            placeholder={translate(f.label)}
            defaultValue={valueOf(f.name)}
          />
        </div>
      ))}
    </div>
  );
}

function SlideNav({
  slide,
  total,
  goTo,
  translate,
  isSubmitting
}: {
  slide: number;
  total: number;
  goTo: (i: number) => void;
  translate: (s: string) => string;
  isSubmitting: boolean;
}) {
  const isFirst = slide === 0;
  const isLast = slide === total - 1;
  return (
    <div className="flex items-center justify-between gap-3 pt-2">
      <Button
        type="button"
        variant="secondary"
        onClick={() => goTo(slide - 1)}
        disabled={isFirst}
        className={isFirst ? "invisible" : ""}
      >
        {translate("Back")}
      </Button>
      {!isLast && (
        <Button type="button" onClick={() => goTo(slide + 1)} disabled={isSubmitting}>
          {translate("Next")}
        </Button>
      )}
    </div>
  );
}
