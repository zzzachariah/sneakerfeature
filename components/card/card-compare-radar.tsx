"use client";

import { Shoe } from "@/lib/types";
import { METRICS, getLineStyle, scoreFor } from "@/components/compare/compare-metrics";
import { useLocale } from "@/components/i18n/locale-provider";

const SIZE = 360;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 138;
const GRID_RINGS = [0.2, 0.4, 0.6, 0.8, 1];

type Props = {
  shoes: Shoe[];
  size?: number;
};

export function CardCompareRadar({ shoes, size = 520 }: Props) {
  const { translate } = useLocale();
  const n = METRICS.length;
  const angles = METRICS.map((_, i) => ((-90 + i * (360 / n)) * Math.PI) / 180);

  const gridPoints = (ratio: number) =>
    angles.map((a) => `${CX + ratio * R * Math.cos(a)},${CY + ratio * R * Math.sin(a)}`).join(" ");

  const shoePoints = (shoe: Shoe) =>
    angles
      .map((a, i) => {
        const score = scoreFor(shoe, METRICS[i].key);
        const v = score / 100;
        return `${CX + v * R * Math.cos(a)},${CY + v * R * Math.sin(a)}`;
      })
      .join(" ");

  return (
    <svg
      viewBox={`-40 -28 ${SIZE + 80} ${SIZE + 56}`}
      width={size}
      height={size}
      style={{ display: "block", overflow: "visible" }}
    >
      {GRID_RINGS.map((ratio) => (
        <polygon
          key={ratio}
          points={gridPoints(ratio)}
          fill="none"
          stroke="rgba(0,0,0,0.1)"
          strokeWidth={0.7}
        />
      ))}
      {angles.map((a, i) => (
        <line
          key={`spoke-${i}`}
          x1={CX}
          y1={CY}
          x2={CX + R * Math.cos(a)}
          y2={CY + R * Math.sin(a)}
          stroke="rgba(0,0,0,0.08)"
          strokeWidth={0.7}
        />
      ))}
      {shoes.map((shoe, si) => {
        const style = getLineStyle(si);
        const fillBase = 0.05 + 0.015 * (shoes.length - si);
        return (
          <polygon
            key={shoe.id}
            points={shoePoints(shoe)}
            fill={`rgba(0,0,0,${fillBase})`}
            stroke={`rgba(0,0,0,${style.opacity})`}
            strokeWidth={style.strokeWidth + 0.2}
            strokeDasharray={style.dashArray}
            strokeLinejoin="round"
          />
        );
      })}
      {shoes[0]
        ? angles.map((a, i) => {
            const score = scoreFor(shoes[0], METRICS[i].key);
            const v = score / 100;
            return (
              <circle
                key={`pt-${i}`}
                cx={CX + v * R * Math.cos(a)}
                cy={CY + v * R * Math.sin(a)}
                r={3}
                fill="rgba(0,0,0,0.92)"
              />
            );
          })
        : null}
      {angles.map((a, i) => {
        const lx = CX + (R + 26) * Math.cos(a);
        const ly = CY + (R + 26) * Math.sin(a);
        return (
          <text
            key={`label-${i}`}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={9.5}
            fontFamily='var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace'
            fontWeight={600}
            fill="rgba(0,0,0,0.7)"
            letterSpacing="0.18em"
            style={{ textTransform: "uppercase" }}
          >
            {translate(METRICS[i].label).toUpperCase()}
          </text>
        );
      })}
    </svg>
  );
}
