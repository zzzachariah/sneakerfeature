"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import { usePremiumVariant, type PremiumVariant } from "@/components/premium/variants";

export type NavScrollSection = { id: string; label: string };

type NavScrollConfig = { sections: NavScrollSection[] } | null;

type Ctx = {
  config: NavScrollConfig;
  setConfig: (c: NavScrollConfig) => void;
};

const NavScrollContext = createContext<Ctx | null>(null);

export function NavScrollIndicatorProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<NavScrollConfig>(null);
  return (
    <NavScrollContext.Provider value={{ config, setConfig }}>
      {children}
    </NavScrollContext.Provider>
  );
}

function useNavScrollCtx() {
  const ctx = useContext(NavScrollContext);
  if (!ctx) {
    throw new Error("Nav scroll hooks must be used within <NavScrollIndicatorProvider>");
  }
  return ctx;
}

/**
 * A continuous-scroll page calls this to publish its in-page sections to the
 * navbar indicator. Each section's `id` must match an element rendered on the
 * page. The list is cleared automatically on unmount/navigation.
 */
export function useNavScrollSections(sections: NavScrollSection[]) {
  const { setConfig } = useNavScrollCtx();
  // Serialize so the effect only re-runs when the sections actually change
  // (the caller passes a fresh array literal on every render).
  const key = sections.map((s) => `${s.id}::${s.label}`).join("|");
  useEffect(() => {
    setConfig({ sections });
    return () => setConfig(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, setConfig]);
}

function readNavHeight() {
  if (typeof document === "undefined") return 64;
  const header = document.querySelector("header");
  return (header?.getBoundingClientRect().height ?? 64) + 8;
}

// ─── Per-skin looks ──────────────────────────────────────────────────────────
// The indicator is one of the few chrome elements every page shares, so it has
// to speak each Premium UI design language rather than staying a single glass
// pill everywhere. Each variant keeps the SAME anatomy — a row of one tappable
// mark per section + the active section's title — and re-draws it as that
// skin's own object:
//   standard   glass pill, round dots           (the untouched site)
//   editorial  printed folio: page no. + rules  (sapphire)
//   instrument glowing HUD meter segments       (aurora)
//   gallery    hairline tick rule, no fill      (obsidian)
//   arena      scoreboard slab, skewed gold bars(champion)
// Widths are deliberately tight: the indicator shares the phone navbar row with
// the logo + member chip on one side and the menu + avatar on the other, so it
// must stay small enough to never crowd them (the label truncates first).

type Look = {
  /** Container chrome. */
  wrap: string;
  /** Gap between the mark row and the label. */
  gap: string;
  /** Gap between marks. */
  markGap: string;
  /** Tap target around each mark (keeps marks themselves hairline-thin). */
  markBtn: string;
  /** The mark itself, per state. */
  mark: (active: boolean) => { className: string; style: CSSProperties };
  label: string;
  labelStyle?: CSSProperties;
  /** Optional leading readout (e.g. the editorial folio number). */
  folio?: string;
  /** What the widget shrinks to when even the marks don't fit. */
  mini: "track" | "count";
  /** Laid-out widths in px, used to pick a fitting mode (see `pickMode`). They
   *  mirror the classes above — keep the two in sync when restyling. */
  m: {
    /** Horizontal padding + border of `wrap`, both sides. */
    chrome: number;
    /** Width of the optional leading readout, including its gap. */
    lead: number;
    /** One mark's laid-out box (mark + `markBtn` padding), idle and active. */
    markIdle: number;
    markActive: number;
    /** `markGap` in px. */
    markGapPx: number;
    /** `gap` in px. */
    gapPx: number;
    /** Width of the mini readout. */
    miniW: number;
  };
};

/** Below this the label is more ellipsis than word, so it's dropped instead. */
const LABEL_MIN = 42;

type Mode = "full" | "marks" | "mini" | "hidden";

/**
 * Pick the richest form that fits the width the navbar's two icon clusters left
 * behind. Degrades label → marks → a bare progress readout → nothing, so the
 * widget never spills out of its slot (which is what used to put it under the
 * membership chip).
 */
function pickMode(look: Look, count: number, avail: number): Mode {
  const { chrome, lead, markIdle, markActive, markGapPx, gapPx, miniW } = look.m;
  const marks = markActive + (count - 1) * (markIdle + markGapPx);
  if (avail >= chrome + lead + marks + gapPx + LABEL_MIN) return "full";
  if (avail >= chrome + lead + marks) return "marks";
  if (avail >= chrome + miniW) return "mini";
  return "hidden";
}

const LOOKS: Record<PremiumVariant, Look> = {
  // Untouched: the original glass pill with round dots.
  standard: {
    wrap: "glass glass-refract glass-rim rounded-full px-2 py-1.5",
    gap: "gap-1.5",
    markGap: "gap-[3px]",
    markBtn: "p-[2px]",
    mark: (active) => ({
      // Animate transform (GPU) not width, so the surrounding glass backdrop
      // isn't re-rasterized every frame — keeps it smooth.
      className:
        "block h-[5px] w-[5px] rounded-full transition-[transform,background-color] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
      style: {
        transform: active ? "scale(1.6)" : "scale(0.9)",
        background: active ? "rgb(var(--text))" : "rgb(var(--muted)/0.55)"
      }
    }),
    label: "text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-[rgb(var(--text)/0.9)]",
    mini: "track",
    m: { chrome: 16, lead: 0, markIdle: 9, markActive: 9, markGapPx: 3, gapPx: 6, miniW: 22 }
  },
  // Sapphire — a printed page: sharp plate, hairline gold rule, folio number
  // and serif small caps. The marks are printer's rules, not dots.
  editorial: {
    wrap:
      "rounded-[2px] border border-[rgb(var(--pui-accent-ink)/0.4)] bg-[rgb(var(--bg)/0.7)] px-2 py-1 backdrop-blur-md",
    gap: "gap-1.5",
    markGap: "gap-[2px]",
    markBtn: "p-[3px]",
    mark: (active) => ({
      className: "block w-px transition-[height,width,background-color] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
      style: {
        height: active ? "11px" : "8px",
        width: active ? "2px" : "1px",
        background: active ? "rgb(var(--pui-accent-ink))" : "rgb(var(--text)/0.3)"
      }
    }),
    label: "text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-[rgb(var(--text)/0.85)]",
    labelStyle: { fontFamily: "var(--pui-display)" },
    folio: "editorial",
    mini: "count",
    m: { chrome: 18, lead: 14, markIdle: 7, markActive: 8, markGapPx: 2, gapPx: 6, miniW: 26 }
  },
  // Aurora — an instrument readout: glowing cyan meter segments that fill up to
  // the section you're on, inside a softly lit capsule.
  instrument: {
    wrap:
      "rounded-full border border-[rgb(var(--pui-glow)/0.45)] bg-[rgb(var(--bg)/0.6)] px-2 py-1 backdrop-blur-md shadow-[0_0_18px_-8px_rgb(var(--pui-glow))]",
    gap: "gap-1.5",
    markGap: "gap-[1px]",
    markBtn: "p-0.5",
    mark: (active) => ({
      className:
        "block h-[3px] rounded-full transition-[width,background-color,box-shadow] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
      style: {
        width: active ? "12px" : "5px",
        background: active ? "rgb(var(--pui-glow))" : "rgb(var(--text)/0.28)",
        boxShadow: active ? "0 0 8px -1px rgb(var(--pui-glow))" : "none"
      }
    }),
    label: "text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-[rgb(var(--pui-accent-ink))]",
    mini: "track",
    m: { chrome: 18, lead: 0, markIdle: 9, markActive: 16, markGapPx: 1, gapPx: 6, miniW: 22 }
  },
  // Obsidian — near-nothing: no fill, just a platinum hairline underscore and a
  // rule of square ticks. The active tick stretches into a bar.
  gallery: {
    // The platinum token is a pale blue-grey tuned for dark grounds, so it is
    // kept to the decorative rim only; the mark + rule use --text so the widget
    // stays legible on the near-white light page too.
    wrap: "rounded-none border-b border-[rgb(var(--text)/0.25)] px-1.5 pb-[5px] pt-0.5",
    gap: "gap-2.5",
    markGap: "gap-[2px]",
    markBtn: "p-0.5",
    mark: (active) => ({
      className: "block h-[2px] transition-[width,background-color] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
      style: {
        width: active ? "10px" : "2px",
        background: active ? "rgb(var(--text)/0.9)" : "rgb(var(--text)/0.32)"
      }
    }),
    label: "text-[0.55rem] font-light uppercase tracking-[0.28em] text-[rgb(var(--text)/0.8)]",
    mini: "track",
    m: { chrome: 12, lead: 0, markIdle: 6, markActive: 14, markGapPx: 2, gapPx: 10, miniW: 20 }
  },
  // Champion — a scoreboard strip: gold-ruled slab, skewed bars that light up
  // gold, label in the arena label face.
  arena: {
    wrap:
      "rounded-[3px] border border-[rgb(var(--pui-gold)/0.55)] bg-[rgb(var(--text)/0.06)] px-2 py-[3px] shadow-[inset_0_-2px_0_rgb(var(--pui-gold)/0.35)]",
    gap: "gap-2",
    markGap: "gap-[2px]",
    markBtn: "p-[2px]",
    mark: (active) => ({
      className: "block w-[5px] skew-x-[-14deg] transition-[height,background-color] duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
      style: {
        height: active ? "10px" : "5px",
        background: active ? "rgb(var(--pui-gold))" : "rgb(var(--text)/0.3)"
      }
    }),
    label: "text-[0.58rem] font-bold uppercase tracking-[0.1em] text-[rgb(var(--pui-accent-ink))]",
    labelStyle: { fontFamily: "var(--pui-label)" },
    mini: "count",
    m: { chrome: 18, lead: 0, markIdle: 9, markActive: 9, markGapPx: 2, gapPx: 8, miniW: 26 }
  }
};

/**
 * The visual indicator that lives in the (otherwise empty on phones) center of
 * the navbar: a row of marks + the very short title of the section currently in
 * view. Marks are tappable to jump. Renders nothing when no page has registered
 * sections. Its whole appearance follows the active Premium UI skin (see LOOKS).
 */
export function NavScrollIndicator() {
  const { config } = useNavScrollCtx();
  const variant = usePremiumVariant();
  const sections = config?.sections ?? null;
  const [activeId, setActiveId] = useState<string | null>(null);
  const rafRef = useRef<number | null>(null);
  // Width of the navbar slot this widget may use — whatever the logo + member
  // chip on one side and the menu + account buttons on the other leave behind.
  // Measured rather than assumed, because it swings with the tier chip's label,
  // the signed-in/out account button, and the viewport width.
  const slotRef = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState<number | null>(null);

  // Re-runs when sections arrive: the widget renders nothing until a page
  // publishes its sections, so on the very first mount there is no node to
  // measure from yet.
  useEffect(() => {
    const el = slotRef.current?.parentElement;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setAvail(entry.contentRect.width));
    ro.observe(el);
    setAvail(el.clientWidth);
    return () => ro.disconnect();
  }, [sections]);

  useEffect(() => {
    if (!sections || sections.length === 0) {
      setActiveId(null);
      return;
    }

    const compute = () => {
      rafRef.current = null;
      const navH = readNavHeight();
      let current = sections[0].id;
      for (const s of sections) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - navH <= 0) current = s.id;
      }
      setActiveId(current);
    };
    const onScroll = () => {
      if (rafRef.current != null) return;
      rafRef.current = window.requestAnimationFrame(compute);
    };

    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [sections]);

  if (!sections || sections.length === 0) return null;

  const activeIndex = Math.max(
    0,
    sections.findIndex((s) => s.id === activeId)
  );
  const activeLabel = sections[activeIndex]?.label ?? "";

  const jump = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const look = LOOKS[variant];
  // Before the first measurement, assume the roomiest form; the observer fires
  // on mount, and the widget itself only ever exists client-side.
  const mode = pickMode(look, sections.length, avail ?? Number.POSITIVE_INFINITY);
  if (mode === "hidden") return <div ref={slotRef} className="hidden" />;

  return (
    // min-w-0 + truncate: the indicator is a flex sibling of the navbar's two
    // icon clusters, so when space runs short the label shortens (and then the
    // widget itself steps down a form) instead of the pill growing into — and
    // overlapping — the member chip or the menu buttons.
    <div
      ref={slotRef}
      className={`relative pointer-events-auto inline-flex min-w-0 max-w-full items-center ${look.gap} ${look.wrap}`}
    >
      {mode === "mini" ? (
        <>
          {/* The marks (and their per-section labels) are gone at this size, so
              name the position for screen readers explicitly. */}
          <span className="sr-only">
            {activeLabel} — {activeIndex + 1}/{sections.length}
          </span>
          {look.mini === "count" ? (
            <span
              aria-hidden
              className={`shrink-0 tabular-nums leading-none ${look.label}`}
              style={look.labelStyle}
            >
              {activeIndex + 1}/{sections.length}
            </span>
          ) : (
            // Bare progress track: no room for one mark per section, so the same
            // information collapses into a filled bar.
            <span aria-hidden className="block h-[3px] w-[20px] shrink-0 rounded-full bg-[rgb(var(--text)/0.22)]">
              <span
                className="block h-full rounded-full bg-[rgb(var(--text)/0.85)] transition-[width] duration-[300ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ width: `${((activeIndex + 1) / sections.length) * 100}%` }}
              />
            </span>
          )}
        </>
      ) : (
        <>
          {look.folio === "editorial" ? (
            <span
              aria-hidden
              className="shrink-0 text-[0.6rem] font-bold leading-none tabular-nums text-[rgb(var(--pui-accent-ink))]"
              style={{ fontFamily: "var(--pui-display)" }}
            >
              {activeIndex + 1}
            </span>
          ) : null}

          <div className={`flex shrink-0 items-center ${look.markGap}`}>
            {sections.map((s, i) => {
              const active = i === activeIndex;
              const m = look.mark(active);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => jump(s.id)}
                  aria-label={s.label}
                  aria-current={active ? "true" : undefined}
                  className={`inline-flex items-center justify-center outline-none ${look.markBtn}`}
                >
                  <span aria-hidden className={m.className} style={m.style} />
                </button>
              );
            })}
          </div>

          {mode === "full" ? (
            <span
              key={activeLabel}
              className={`truncate ${look.label}`}
              style={{
                ...look.labelStyle,
                animation: "navIndicatorLabelIn 280ms cubic-bezier(0.22,1,0.36,1)"
              }}
            >
              {activeLabel}
            </span>
          ) : null}
        </>
      )}
    </div>
  );
}
