"use client";

import type { RadarAxis } from "@/components/detail/performance-radar";
import { useLocale } from "@/components/i18n/locale-provider";

const VIEW = 320;
const CENTER = VIEW / 2;
const MAX_RADIUS = 110;
const LABEL_RADIUS = 138;
const VALUE_RADIUS = 158;

function polar(radius: number, angleRad: number) {
  return {
    x: CENTER + radius * Math.sin(angleRad),
    y: CENTER - radius * Math.cos(angleRad),
  };
}

function ringPath(radius: number, count: number) {
  const pts = Array.from({ length: count }, (_, i) => {
    const theta = (i / count) * Math.PI * 2;
    const { x, y } = polar(radius, theta);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  return `M${pts.join(" L")} Z`;
}

type Props = {
  axes: RadarAxis[];
  size?: number;
};

export function CardStaticRadar({ axes, size = 460 }: Props) {
  const { translate } = useLocale();
  const count = axes.length;
  const polygonPoints = axes
    .map((axis, i) => {
      const theta = (i / count) * Math.PI * 2;
      const clamped = Math.max(0, Math.min(100, axis.score));
      const r = (clamped / 100) * MAX_RADIUS;
      const { x, y } = polar(r, theta);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  const rings = [0.25, 0.5, 0.75, 1];

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      width={size}
      height={size}
      style={{ display: "block", overflow: "visible" }}
    >
      {rings.map((r, i) => (
        <path
          key={r}
          d={ringPath(MAX_RADIUS * r, count)}
          fill={i === rings.length - 1 ? "rgba(0,0,0,0.025)" : "none"}
          stroke="rgba(0,0,0,0.12)"
          strokeWidth={0.8}
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
            stroke="rgba(0,0,0,0.1)"
            strokeWidth={0.8}
          />
        );
      })}

      <polygon
        points={polygonPoints}
        fill="rgba(0,0,0,0.06)"
        stroke="rgba(0,0,0,0.85)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />

      {axes.map((axis, i) => {
        const theta = (i / count) * Math.PI * 2;
        const clamped = Math.max(0, Math.min(100, axis.score));
        const r = (clamped / 100) * MAX_RADIUS;
        const { x, y } = polar(r, theta);
        return (
          <circle
            key={`pt-${i}`}
            cx={x}
            cy={y}
            r={3}
            fill="rgb(0,0,0)"
            stroke="rgb(255,255,255)"
            strokeWidth={1.4}
          />
        );
      })}

      {axes.map((axis, i) => {
        const theta = (i / count) * Math.PI * 2;
        const labelPos = polar(LABEL_RADIUS, theta);
        const valuePos = polar(VALUE_RADIUS, theta);
        const score = Math.max(0, Math.min(100, Math.round(axis.score)));
        return (
          <g key={`label-${i}`}>
            <text
              x={labelPos.x}
              y={labelPos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={8.5}
              fontFamily='var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace'
              fontWeight={600}
              letterSpacing="0.18em"
              fill="rgba(0,0,0,0.55)"
              style={{ textTransform: "uppercase" }}
            >
              {translate(axis.label).toUpperCase()}
            </text>
            <text
              x={valuePos.x}
              y={valuePos.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={14}
              fontFamily='var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace'
              fontWeight={800}
              letterSpacing="-0.02em"
              fill="rgba(0,0,0,0.92)"
            >
              {score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
