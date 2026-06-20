"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { useInView, useProgress } from "@/components/motion/use-progress";
import { scoreColor } from "@/lib/score-tone";

export type RadarAxis = {
  label: string;
  rawText: string | null | undefined;
  score: number;
  tier: string;
};

type Props = {
  axes: RadarAxis[];
  /**
   * When provided (slide decks), the chart grows from the center and REPLAYS
   * each time the slide becomes active. When omitted, it plays once on scroll.
   */
  active?: boolean;
};

const VIEW = 320;
const CENTER = VIEW / 2;
const MAX_RADIUS = 92;
const LABEL_RADIUS = 128;

function polar(radius: number, angleRad: number) {
  const x = Number((CENTER + radius * Math.sin(angleRad)).toFixed(3));
  const y = Number((CENTER - radius * Math.cos(angleRad)).toFixed(3));
  return { x, y };
}

function ringPath(radius: number, count: number) {
  const pts = Array.from({ length: count }, (_, i) => {
    const theta = (i / count) * Math.PI * 2;
    const { x, y } = polar(radius, theta);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M${pts.join(" L")} Z`;
}

export function PerformanceRadar({ axes, active }: Props) {
  const count = axes.length;
  const { ref, inView } = useInView<HTMLDivElement>();
  // Slide decks pass `active` (replays on re-entry); elsewhere fall back to a
  // one-shot reveal when the chart scrolls into view.
  const progress = useProgress(active ?? inView);

  const polygonPoints = axes
    .map((axis, i) => {
      const theta = (i / count) * Math.PI * 2;
      const clamped = Math.max(0, Math.min(100, axis.score));
      const r = (clamped / 100) * MAX_RADIUS * progress;
      const { x, y } = polar(r, theta);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const rings = [0.25, 0.5, 0.75, 1];
  const labelsVisible = progress > 0.82;

  return (
    <div ref={ref} className="relative mx-auto w-full max-w-md">
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label="Performance radar chart"
      >
        {rings.map((r, i) => (
          <path
            key={r}
            d={ringPath(MAX_RADIUS * r, count)}
            fill={i === rings.length - 1 ? "rgb(var(--bg-elev) / 0.35)" : "none"}
            stroke="rgb(var(--glass-stroke-soft) / 0.55)"
            strokeWidth={1}
          />
        ))}

        {axes.map((_, i) => {
          const theta = (i / count) * Math.PI * 2;
          const { x, y } = polar(MAX_RADIUS, theta);
          return (
            <line
              key={`spoke-${i}`}
              x1={CENTER}
              y1={CENTER}
              x2={x}
              y2={y}
              stroke="rgb(var(--glass-stroke-soft) / 0.45)"
              strokeWidth={1}
            />
          );
        })}

        <polygon
          points={polygonPoints}
          fill="rgb(var(--text) / 0.18)"
          stroke="rgb(var(--text) / 0.85)"
          strokeWidth={1.75}
          strokeLinejoin="round"
        />

        {axes.map((axis, i) => {
          const theta = (i / count) * Math.PI * 2;
          const clamped = Math.max(0, Math.min(100, axis.score));
          const r = (clamped / 100) * MAX_RADIUS * progress;
          const { x, y } = polar(r, theta);
          return (
            <circle
              key={`pt-${i}`}
              cx={x}
              cy={y}
              r={3.5}
              fill="rgb(var(--text))"
              stroke="rgb(var(--bg-elev))"
              strokeWidth={1.5}
            />
          );
        })}
      </svg>

      <div className="pointer-events-none absolute inset-0">
        {axes.map((axis, i) => (
          <AxisLabel key={axis.label} axis={axis} index={i} count={count} visible={labelsVisible} />
        ))}
      </div>
    </div>
  );
}

function AxisLabel({
  axis,
  index,
  count,
  visible
}: {
  axis: RadarAxis;
  index: number;
  count: number;
  visible: boolean;
}) {
  const { translate } = useLocale();
  const theta = (index / count) * Math.PI * 2;
  const { x, y } = polar(LABEL_RADIUS, theta);
  const leftPct = Number(((x / VIEW) * 100).toFixed(3));
  const topPct = Number(((y / VIEW) * 100).toFixed(3));
  const clamped = Math.max(0, Math.min(100, Math.round(axis.score)));

  return (
    <div
      className="absolute flex w-[28%] flex-col items-center gap-0.5 text-center leading-tight"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: "translate(-50%, -50%)",
        opacity: visible ? 1 : 0,
        transition: "opacity 420ms var(--ease)",
        transitionDelay: `${index * 40}ms`
      }}
      title={axis.rawText?.trim() ? axis.rawText : undefined}
    >
      <p className="num-display text-[0.5rem] font-semibold uppercase tracking-[0.14em] soft-text md:text-[0.55rem]">
        {translate(axis.label)}
      </p>
      <span
        className="num-display text-sm font-semibold md:text-base"
        style={{ color: scoreColor(clamped) }}
      >
        {clamped}
      </span>
      <span
        className="num-display hidden text-[0.65rem] md:inline"
        style={{ color: scoreColor(clamped, 0.85) }}
      >
        {translate(axis.tier)}
      </span>
    </div>
  );
}
