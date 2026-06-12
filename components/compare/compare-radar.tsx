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

export function CompareRadar({ shoes, active }: Props) {
  const { translate } = useLocale();
  const { ref, inView } = useInView<HTMLDivElement>();
  const progress = useProgress(active ?? inView);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
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
        className="mx-auto block w-full max-w-[360px]"
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
          const dimmed = hoverIdx !== null && hoverIdx !== si;
          const fillBase = 0.06 + 0.02 * (shoes.length - si);
          return (
            <polygon
              key={shoe.id}
              points={shoePoints(shoe)}
              fill={`rgb(var(--text) / ${fillBase})`}
              stroke={`rgb(var(--text) / ${style.opacity})`}
              strokeWidth={style.strokeWidth}
              strokeDasharray={style.dashArray}
              strokeLinejoin="round"
              style={{
                opacity: dimmed ? 0.28 : 1,
                transition: "opacity 220ms cubic-bezier(0.22,1,0.36,1)"
              }}
            />
          );
        })}
        {shoes[0]
          ? angles.map((a, i) => {
              const score = scoreFor(shoes[0], METRICS[i].key);
              const v = (score / 100) * progress;
              return (
                <circle
                  key={i}
                  cx={CX + v * R * Math.cos(a)}
                  cy={CY + v * R * Math.sin(a)}
                  r={3}
                  fill="rgb(var(--text) / 0.9)"
                />
              );
            })
          : null}
        {angles.map((a, i) => {
          const lx = CX + (R + 26) * Math.cos(a);
          const ly = CY + (R + 26) * Math.sin(a);
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={9}
              fontFamily="inherit"
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
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {shoes.map((shoe, si) => {
          const style = getLineStyle(si);
          const active = hoverIdx === si;
          return (
            <button
              key={shoe.id}
              type="button"
              onPointerEnter={() => setHoverIdx(si)}
              onPointerLeave={() => setHoverIdx((cur) => (cur === si ? null : cur))}
              onFocus={() => setHoverIdx(si)}
              onBlur={() => setHoverIdx((cur) => (cur === si ? null : cur))}
              className={`flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-200 hover:bg-[rgb(var(--text)/0.04)] ${
                active ? "bg-[rgb(var(--text)/0.06)]" : ""
              }`}
            >
              <svg width={22} height={6} aria-hidden style={{ opacity: active ? 1 : 0.85, transition: "opacity 180ms cubic-bezier(0.22,1,0.36,1)" }}>
                <line
                  x1={0}
                  y1={3}
                  x2={22}
                  y2={3}
                  stroke={`rgb(var(--text) / ${style.opacity})`}
                  strokeWidth={style.strokeWidth}
                  strokeDasharray={style.dashArray}
                />
              </svg>
              <span className={`text-[0.7rem] transition-colors ${active ? "text-[rgb(var(--text))]" : "soft-text"}`}>
                {shoe.shoe_name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
