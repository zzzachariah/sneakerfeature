"use client";

import { useState } from "react";
import { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { useInView, useProgress } from "@/components/motion/use-progress";
import { METRICS, getLineStyle, scoreFor } from "@/components/compare/compare-metrics";

const SIZE = 360;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 128;
const GRID_RINGS = [0.2, 0.4, 0.6, 0.8, 1];

type Props = {
  shoes: Shoe[];
  /** Slide-active flag — replays the draw-in each time the radar slide opens. */
  active?: boolean;
};

// Highlight palette slot for a shoe's lineup position (see --radar-c* in
// globals.css). Only applied to legend-SELECTED shoes — the resting chart
// stays monochrome.
function highlightColor(index: number, alpha?: number) {
  const ref = `var(--radar-c${(index % 5) + 1})`;
  return alpha == null ? `rgb(${ref})` : `rgb(${ref} / ${alpha})`;
}

export function CompareRadar({ shoes, active }: Props) {
  const { translate } = useLocale();
  // `repeat` so the draw-in plays every time the chart scrolls into view, not
  // only the first time. Slide decks pass `active` to keep their own behavior.
  const { ref, inView } = useInView<HTMLDivElement>(0.15, { repeat: true });
  const progress = useProgress(active ?? inView);
  // Legend-selected shoe ids (tap to toggle, multi-select). Selected shoes get
  // a highlight colour + thicker stroke; the rest fade back. Works the same on
  // touch and desktop — the old hover-only dimming was useless on phones.
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const toggleShoe = (id: string) =>
    setActiveIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const anySelected = shoes.some((shoe) => activeIds.has(shoe.id));
  const n = METRICS.length;
  const angles = METRICS.map((_, i) => ((-90 + i * (360 / n)) * Math.PI) / 180);

  const gridPoints = (ratio: number) =>
    angles.map((a) => `${CX + ratio * R * Math.cos(a)},${CY + ratio * R * Math.sin(a)}`).join(" ");

  const shoePoints = (shoe: Shoe) =>
    angles
      .map((a, i) => {
        const score = scoreFor(shoe, METRICS[i].key);
        const v = (score / 100) * progress;
        return `${CX + v * R * Math.cos(a)},${CY + v * R * Math.sin(a)}`;
      })
      .join(" ");

  const labelsVisible = progress > 0.88;

  return (
    <div ref={ref}>
      <svg
        viewBox={`-30 -16 ${SIZE + 60} ${SIZE + 32}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block w-full max-w-[260px] sm:max-w-[300px] lg:max-w-[420px]"
        style={{ overflow: "visible" }}
      >
        {GRID_RINGS.map((ratio) => (
          <polygon
            key={ratio}
            points={gridPoints(ratio)}
            fill="none"
            stroke="rgb(var(--muted) / 0.7)"
            strokeWidth={0.8}
          />
        ))}
        {angles.map((a, i) => (
          <line
            key={i}
            x1={CX}
            y1={CY}
            x2={CX + R * Math.cos(a)}
            y2={CY + R * Math.sin(a)}
            stroke="rgb(var(--muted) / 0.55)"
            strokeWidth={0.8}
          />
        ))}
        {shoes.map((shoe, si) => {
          const style = getLineStyle(si);
          const selected = activeIds.has(shoe.id);
          const dimmed = anySelected && !selected;
          const fillBase = 0.06 + 0.02 * (shoes.length - si);
          return (
            <polygon
              key={shoe.id}
              points={shoePoints(shoe)}
              fill={selected ? highlightColor(si, 0.12) : `rgb(var(--text) / ${fillBase})`}
              stroke={selected ? highlightColor(si) : `rgb(var(--text) / ${style.opacity})`}
              strokeWidth={selected ? style.strokeWidth + 0.8 : style.strokeWidth}
              strokeDasharray={style.dashArray}
              strokeLinejoin="round"
              style={{
                opacity: dimmed ? 0.14 : 1,
                transition:
                  "opacity 220ms cubic-bezier(0.22,1,0.36,1), stroke 220ms cubic-bezier(0.22,1,0.36,1), fill 220ms cubic-bezier(0.22,1,0.36,1), stroke-width 220ms cubic-bezier(0.22,1,0.36,1)"
              }}
            />
          );
        })}
        {/* Vertex dots: on the lead shoe by default; on every selected shoe
            (in its highlight colour) once the legend is used. */}
        {(anySelected ? shoes.filter((shoe) => activeIds.has(shoe.id)) : shoes.slice(0, 1)).map((shoe) => {
          const si = shoes.indexOf(shoe);
          return angles.map((a, i) => {
            const score = scoreFor(shoe, METRICS[i].key);
            const v = (score / 100) * progress;
            return (
              <circle
                key={`${shoe.id}-${i}`}
                cx={CX + v * R * Math.cos(a)}
                cy={CY + v * R * Math.sin(a)}
                r={3}
                fill={anySelected ? highlightColor(si, 0.95) : "rgb(var(--text) / 0.9)"}
              />
            );
          });
        })}
        {angles.map((a, i) => {
          // Pushed out from R+26 so longer labels (e.g. "抓地力/止滑程度") don't
          // visually crowd the chart's outer ring.
          const lx = CX + (R + 40) * Math.cos(a);
          const ly = CY + (R + 40) * Math.sin(a);
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontFamily='var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace'
              fontWeight={500}
              fill="rgb(var(--subtext) / 0.9)"
              letterSpacing="0.14em"
              style={{
                opacity: labelsVisible ? 1 : 0,
                transition: "opacity 420ms cubic-bezier(0.22,1,0.36,1)",
                transitionDelay: `${i * 40}ms`
              }}
            >
              {translate(METRICS[i].label).toUpperCase()}
            </text>
          );
        })}
      </svg>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {shoes.map((shoe, si) => {
          const style = getLineStyle(si);
          const selected = activeIds.has(shoe.id);
          return (
            <button
              key={shoe.id}
              type="button"
              onClick={() => toggleShoe(shoe.id)}
              aria-pressed={selected}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-200 ${
                selected
                  ? "text-[rgb(var(--text))]"
                  : "border-[rgb(var(--glass-stroke-soft)/0.5)] soft-text hover:border-[rgb(var(--text)/0.3)] hover:text-[rgb(var(--text))]"
              }`}
              style={
                selected
                  ? { borderColor: highlightColor(si, 0.55), background: highlightColor(si, 0.1) }
                  : undefined
              }
            >
              <svg width={22} height={6} aria-hidden>
                <line
                  x1={0}
                  y1={3}
                  x2={22}
                  y2={3}
                  stroke={selected ? highlightColor(si) : "rgb(var(--subtext) / 0.65)"}
                  strokeWidth={selected ? style.strokeWidth + 0.6 : style.strokeWidth}
                  strokeDasharray={style.dashArray}
                  style={{ transition: "stroke 180ms cubic-bezier(0.22,1,0.36,1)" }}
                />
              </svg>
              <span className={`num-display text-[0.7rem] ${selected ? "font-semibold" : ""}`}>{shoe.shoe_name}</span>
            </button>
          );
        })}
      </div>
      {shoes.length > 1 ? (
        <p className="mt-2 text-center text-[0.62rem] tracking-[0.04em] soft-text">
          {translate("Tap a shoe to highlight its line — tap several to compare.")}
        </p>
      ) : null}
    </div>
  );
}
