"use client";

// Per-skin compare radar — the multi-shoe sibling of PremiumRadar (detail).
// Same four structural languages, adapted to overlaid series:
//   • Editorial — ink plate: the shoes' polygons printed as inks on a cream
//     paper disc inside a gold frame, serif captions.
//   • Instrument — scope: dial rings, degree ticks, rotating sweep beam and
//     one glowing trace per shoe, corner brackets.
//   • Gallery — catalogue plate: one hairline circle, 1px line drawings,
//     tracked captions and a FIG. plate number.
//   • Arena — tale of the tape: hexagonal rings over a gold glow, heavy
//     strokes, condensed captions, per-shoe OVR chips in the legend.
// Keeps CompareRadar's interaction model verbatim: per-position identity
// colors + dash styles, tap-the-legend multi-select highlighting, and the
// draw-in that replays on scroll. Standard users keep CompareRadar.

import { useState } from "react";
import { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { useInView, useProgress } from "@/components/motion/use-progress";
import { METRICS, getLineStyle, identityColor, scoreFor } from "@/components/compare/compare-metrics";
import type { PremiumVariant } from "@/components/premium/variants";

type Variant = Exclude<PremiumVariant, "standard">;

const SIZE = 360;
const CX = SIZE / 2;
const CY = SIZE / 2;
const R = 128;
// viewBox bounds (shared with CompareRadar) — the instrument brackets pin to
// these corners so the frame wraps the whole drawing, labels included.
const VBX = -30;
const VBY = -16;
const VBW = SIZE + 60;
const VBH = SIZE + 32;

type Props = {
  variant: Variant;
  shoes: Shoe[];
  /** Slide-active flag — replays the draw-in each time the radar becomes active. */
  active?: boolean;
};

// The editorial plate is constant cream in both themes, so its inks are the
// fixed light-theme radar palette (see --pui-ed-radar-c*), not the theme-aware
// tokens — a dark-theme pastel would wash out on paper.
function inkColor(index: number, alpha?: number) {
  const ref = `var(--pui-ed-radar-c${(index % 5) + 1})`;
  return alpha == null ? `rgb(${ref})` : `rgb(${ref} / ${alpha})`;
}

export function PremiumCompareRadar({ variant, shoes, active }: Props) {
  const { translate } = useLocale();
  const { ref, inView } = useInView<HTMLDivElement>(0.15, { repeat: true });
  const progress = useProgress(active ?? inView);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const toggleShoe = (id: string) =>
    setActiveIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const anySelected = shoes.some((shoe) => activeIds.has(shoe.id));
  const seriesColor = variant === "editorial" ? inkColor : identityColor;

  const n = METRICS.length;
  const angles = METRICS.map((_, i) => ((-90 + i * (360 / n)) * Math.PI) / 180);
  const ringPoints = (ratio: number) =>
    angles.map((a) => `${CX + ratio * R * Math.cos(a)},${CY + ratio * R * Math.sin(a)}`).join(" ");
  const shoePoints = (shoe: Shoe) =>
    angles
      .map((a, i) => {
        const v = (scoreFor(shoe, METRICS[i].key) / 100) * progress;
        return `${CX + v * R * Math.cos(a)},${CY + v * R * Math.sin(a)}`;
      })
      .join(" ");

  const labelsVisible = progress > 0.88;

  // Per-variant series treatment over the shared identity dash styles: the
  // scope adds a glow underlay, the plate thins to line drawings, the tape
  // muscles the strokes up.
  const seriesFor = (si: number, selected: boolean) => {
    const style = getLineStyle(si);
    const base = { strokeWidth: style.strokeWidth, dashArray: style.dashArray, fillAlpha: 0.06 + 0.02 * (shoes.length - si), glow: false };
    if (variant === "instrument") return { ...base, glow: true, fillAlpha: 0.07 };
    if (variant === "gallery") return { ...base, strokeWidth: Math.min(style.strokeWidth, 1.2), fillAlpha: selected ? 0.07 : 0.03 };
    if (variant === "arena") return { ...base, strokeWidth: style.strokeWidth + 1.1, fillAlpha: 0.12 };
    // Editorial: inks on paper — near-pure outlines, or 3+ stacked fills mix
    // into mud on the cream plate.
    return { ...base, strokeWidth: style.strokeWidth + 0.2, fillAlpha: 0.04 };
  };

  const LABEL_STYLE: Record<Variant, React.SVGProps<SVGTextElement>> = {
    editorial: { fontSize: 10.5, fontFamily: "var(--pui-cjk)", fontStyle: "italic", fill: "rgb(var(--pui-accent-ink))", letterSpacing: "0.04em" },
    instrument: { fontSize: 9, fontFamily: 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace', fontWeight: 500, fill: "rgb(var(--text) / 0.85)", letterSpacing: "0.14em" },
    gallery: { fontSize: 8.5, fontWeight: 350, fill: "rgb(var(--subtext))", letterSpacing: "0.24em" },
    arena: { fontSize: 9.5, fontFamily: "var(--pui-label, sans-serif)", fontWeight: 600, fill: "rgb(var(--text) / 0.85)", letterSpacing: "0.14em" },
  };
  const upcase = variant !== "editorial";

  return (
    <div ref={ref} className={`pui-cradar pui-cradar--${variant}`}>
      <svg
        viewBox={`${VBX} ${VBY} ${VBW} ${VBH}`}
        preserveAspectRatio="xMidYMid meet"
        className="mx-auto block w-full max-w-[260px] sm:max-w-[300px] lg:max-w-[420px]"
        style={{ overflow: "visible" }}
        role="img"
        aria-label={`${translate("Performance radar chart")}: ${shoes.map((s) => s.shoe_name).join(" · ")}`}
      >
        {variant === "editorial" && <EditorialChrome angles={angles} />}
        {variant === "instrument" && <InstrumentChrome />}
        {variant === "gallery" && <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgb(var(--text) / 0.22)" strokeWidth={0.75} />}
        {variant === "arena" && <ArenaChrome angles={angles} ringPoints={ringPoints} />}

        {shoes.map((shoe, si) => {
          const selected = activeIds.has(shoe.id);
          const dimmed = anySelected && !selected;
          const s = seriesFor(si, selected);
          const seriesTransition =
            "opacity 220ms cubic-bezier(0.22,1,0.36,1), stroke 220ms cubic-bezier(0.22,1,0.36,1), fill 220ms cubic-bezier(0.22,1,0.36,1), stroke-width 220ms cubic-bezier(0.22,1,0.36,1)";
          return (
            <g key={shoe.id} style={{ opacity: dimmed ? 0.14 : 1, transition: seriesTransition }}>
              {s.glow ? (
                <polygon
                  points={shoePoints(shoe)}
                  fill="none"
                  stroke={seriesColor(si, selected ? 0.3 : 0.2)}
                  strokeWidth={s.strokeWidth + 4}
                  strokeLinejoin="round"
                />
              ) : null}
              <polygon
                points={shoePoints(shoe)}
                fill={seriesColor(si, selected ? Math.min(0.16, s.fillAlpha + 0.05) : Math.min(0.16, s.fillAlpha))}
                stroke={seriesColor(si, selected ? 1 : Math.min(1, getLineStyle(si).opacity + 0.08))}
                strokeWidth={selected ? s.strokeWidth + 0.8 : s.strokeWidth}
                strokeDasharray={s.dashArray}
                strokeLinejoin="round"
                style={{ transition: seriesTransition }}
              />
            </g>
          );
        })}

        {(anySelected ? shoes.filter((shoe) => activeIds.has(shoe.id)) : shoes.slice(0, 1)).map((shoe) => {
          const si = shoes.indexOf(shoe);
          return angles.map((a, i) => {
            const v = (scoreFor(shoe, METRICS[i].key) / 100) * progress;
            return (
              <circle
                key={`${shoe.id}-${i}`}
                cx={CX + v * R * Math.cos(a)}
                cy={CY + v * R * Math.sin(a)}
                r={variant === "arena" ? 3.5 : variant === "gallery" ? 2 : 3}
                fill={seriesColor(si, 0.95)}
              />
            );
          });
        })}

        {angles.map((a, i) => {
          const lx = CX + (R + (variant === "editorial" ? 44 : 40)) * Math.cos(a);
          const ly = CY + (R + (variant === "editorial" ? 44 : 40)) * Math.sin(a);
          const label = translate(METRICS[i].label);
          return (
            <text
              key={i}
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              {...LABEL_STYLE[variant]}
              style={{
                opacity: labelsVisible ? 1 : 0,
                transition: "opacity 420ms cubic-bezier(0.22,1,0.36,1)",
                transitionDelay: `${i * 40}ms`,
              }}
            >
              {upcase ? label.toUpperCase() : label}
            </text>
          );
        })}
      </svg>

      {variant === "gallery" && <p className="pui-fig-cap text-center">FIG. 02 — {translate("Performance profile")}</p>}

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
              style={selected ? { borderColor: identityColor(si, 0.55), background: identityColor(si, 0.1) } : undefined}
            >
              <svg width={22} height={6} aria-hidden>
                <line
                  x1={0}
                  y1={3}
                  x2={22}
                  y2={3}
                  stroke={identityColor(si, selected ? 1 : 0.85)}
                  strokeWidth={selected ? style.strokeWidth + 0.6 : style.strokeWidth}
                  strokeDasharray={style.dashArray}
                  style={{ transition: "stroke 180ms cubic-bezier(0.22,1,0.36,1)" }}
                />
              </svg>
              <span className={`num-display text-[0.7rem] ${selected ? "font-semibold" : ""}`}>{shoe.shoe_name}</span>
              {variant === "arena" ? (
                <span className="pui-cradar-ovr">
                  {translate("OVR")} {Math.round(METRICS.reduce((sum, m) => sum + scoreFor(shoe, m.key), 0) / METRICS.length)}
                </span>
              ) : null}
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

function EditorialChrome({ angles }: { angles: number[] }) {
  return (
    <>
      <circle cx={CX} cy={CY} r={R + 22} fill="none" stroke="rgb(var(--pui-accent-ink) / 0.55)" strokeWidth={1} />
      <circle cx={CX} cy={CY} r={R + 14} fill="rgb(var(--pui-ed-paper))" />
      {[0.33, 0.66, 1].map((f) => (
        <circle key={f} cx={CX} cy={CY} r={R * f} fill="none" stroke="rgb(var(--pui-ed-ink) / 0.12)" strokeWidth={0.75} />
      ))}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={CX}
          y1={CY}
          x2={CX + R * Math.cos(a)}
          y2={CY + R * Math.sin(a)}
          stroke="rgb(var(--pui-ed-ink) / 0.1)"
          strokeWidth={0.75}
        />
      ))}
    </>
  );
}

function InstrumentChrome() {
  // Sweep beam twin of the detail scope's (unique gradient id per chart).
  const trailA = -0.75;
  const tx = CX + R * Math.sin(trailA);
  const ty = CY - R * Math.cos(trailA);
  return (
    <>
      <defs>
        <linearGradient id="pui-cscope-grad" gradientUnits="userSpaceOnUse" x1={CX} y1={CY - R} x2={tx} y2={ty}>
          <stop offset="0" style={{ stopColor: "rgb(var(--brand))", stopOpacity: 0.3 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--brand))", stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle key={f} cx={CX} cy={CY} r={R * f} fill="none" stroke={`rgb(var(--brand) / ${f === 1 ? 0.4 : 0.16})`} strokeWidth={1} />
      ))}
      <line x1={CX - R} y1={CY} x2={CX + R} y2={CY} stroke="rgb(var(--brand) / 0.14)" strokeWidth={1} />
      <line x1={CX} y1={CY - R} x2={CX} y2={CY + R} stroke="rgb(var(--brand) / 0.14)" strokeWidth={1} />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={CX + (R - 4) * Math.cos(a)}
            y1={CY + (R - 4) * Math.sin(a)}
            x2={CX + R * Math.cos(a)}
            y2={CY + R * Math.sin(a)}
            stroke="rgb(var(--brand) / 0.5)"
            strokeWidth={1}
          />
        );
      })}
      <g className="pui-scope-sweep">
        <path d={`M${CX},${CY} L${CX},${CY - R} A${R},${R} 0 0 0 ${tx.toFixed(2)},${ty.toFixed(2)} Z`} fill="url(#pui-cscope-grad)">
          <animateTransform attributeName="transform" type="rotate" from={`0 ${CX} ${CY}`} to={`360 ${CX} ${CY}`} dur="8s" repeatCount="indefinite" />
        </path>
      </g>
      {[
        [VBX + 8, VBY + 8, 1, 1],
        [VBX + VBW - 8, VBY + 8, -1, 1],
        [VBX + 8, VBY + VBH - 8, 1, -1],
        [VBX + VBW - 8, VBY + VBH - 8, -1, -1],
      ].map(([x, y, dx, dy], i) => (
        <path key={i} d={`M${x + dx * 14},${y} L${x},${y} L${x},${y + dy * 14}`} fill="none" stroke="rgb(var(--brand) / 0.5)" strokeWidth={1.5} />
      ))}
    </>
  );
}

function ArenaChrome({ angles, ringPoints }: { angles: number[]; ringPoints: (ratio: number) => string }) {
  return (
    <>
      <defs>
        <radialGradient id="pui-carena-glow" gradientUnits="userSpaceOnUse" cx={CX} cy={CY} r={R + 28}>
          <stop offset="0" style={{ stopColor: "rgb(var(--pui-gold))", stopOpacity: 0.1 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--pui-gold))", stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <circle cx={CX} cy={CY} r={R + 28} fill="url(#pui-carena-glow)" />
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f} points={ringPoints(f)} fill="none" stroke={`rgb(var(--pui-accent-ink) / ${f === 1 ? 0.32 : 0.14})`} strokeWidth={1.25} />
      ))}
      {angles.map((a, i) => (
        <line
          key={i}
          x1={CX}
          y1={CY}
          x2={CX + R * Math.cos(a)}
          y2={CY + R * Math.sin(a)}
          stroke="rgb(var(--pui-accent-ink) / 0.18)"
          strokeWidth={1.5}
        />
      ))}
    </>
  );
}
