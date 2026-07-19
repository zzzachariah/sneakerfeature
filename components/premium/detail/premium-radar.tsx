"use client";

// Per-skin radar charts for the premium detail page. Each variant is a
// structurally different drawing — not a restyle of the same chart:
//   • Editorial — "ink plate": a solid navy-ink polygon printed on a cream
//     paper disc inside a gold frame, serif captions around it.
//   • Instrument — "scope": a circular instrument dial with degree ticks, a
//     slowly rotating sweep beam and a glowing accent trace.
//   • Gallery — "catalogue plate": one hairline circle, a 1px line-drawing
//     polygon, tiny tracked captions and a FIG. plate number.
//   • Arena — "rating card": a gold-filled attribute radar with a score badge
//     at every vertex and an OVR chip, broadcast-graphics style.
// Reads the same RadarAxis data as the standard PerformanceRadar; the score
// polygon grows from the center each time it scrolls into view, exactly like
// the standard chart. All colors resolve through skin tokens so every variant
// keeps its contrast in both light and dark themes.

import { useLocale } from "@/components/i18n/locale-provider";
import { useInView, useProgress } from "@/components/motion/use-progress";
import type { RadarAxis } from "@/components/detail/performance-radar";
import type { PremiumVariant } from "@/components/premium/variants";

type Variant = Exclude<PremiumVariant, "standard">;

const VIEW = 320;
const CENTER = VIEW / 2;

// Chart + caption radii per variant. Editorial sits deepest because the paper
// disc and gold frame need clearance before the captions start.
const GEOMETRY: Record<Variant, { radius: number; labelRadius: number }> = {
  editorial: { radius: 86, labelRadius: 140 },
  instrument: { radius: 96, labelRadius: 141 },
  gallery: { radius: 86, labelRadius: 134 },
  arena: { radius: 90, labelRadius: 126 },
};

function polar(radius: number, angleRad: number) {
  const x = Number((CENTER + radius * Math.sin(angleRad)).toFixed(3));
  const y = Number((CENTER - radius * Math.cos(angleRad)).toFixed(3));
  return { x, y };
}

function scorePoints(axes: RadarAxis[], maxRadius: number, progress: number) {
  return axes
    .map((axis, i) => {
      const theta = (i / axes.length) * Math.PI * 2;
      const clamped = Math.max(0, Math.min(100, axis.score));
      const { x, y } = polar((clamped / 100) * maxRadius * progress, theta);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function ringPoints(radius: number, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const { x, y } = polar(radius, (i / count) * Math.PI * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function PremiumRadar({ variant, axes }: { variant: Variant; axes: RadarAxis[] }) {
  const { translate } = useLocale();
  const { ref, inView } = useInView<HTMLDivElement>(0.15, { repeat: true });
  const progress = useProgress(inView);
  const { radius, labelRadius } = GEOMETRY[variant];
  const labelsVisible = progress > 0.82;

  const CHARTS: Record<Variant, () => React.ReactNode> = {
    editorial: () => <EditorialPlate axes={axes} radius={radius} progress={progress} />,
    instrument: () => <InstrumentScope axes={axes} radius={radius} progress={progress} />,
    gallery: () => <GalleryPlate axes={axes} radius={radius} progress={progress} />,
    arena: () => <ArenaRating axes={axes} radius={radius} progress={progress} />,
  };

  return (
    <div ref={ref} className={`pui-radar pui-radar--${variant} relative mx-auto w-full max-w-md`}>
      <svg
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        className="block h-auto w-full overflow-visible"
        role="img"
        aria-label={`${translate("Performance radar chart")}: ${axes.map((a) => `${translate(a.label)} ${Math.round(a.score)}`).join(", ")}`}
      >
        {CHARTS[variant]()}
      </svg>

      {variant === "arena" && (
        <div className="pui-ovr" style={{ opacity: labelsVisible ? 1 : 0 }}>
          <span>{translate("OVR")}</span>
          <strong>{Math.round(axes.reduce((sum, a) => sum + a.score, 0) / Math.max(1, axes.length))}</strong>
        </div>
      )}

      {/* Screen-reader fallback: the SVG is decorative detail; this table is
          the accessible record of every axis score. */}
      <table className="sr-only">
        <caption>{translate("Performance scores")}</caption>
        <tbody>
          {axes.map((a) => (
            <tr key={a.label}>
              <th scope="row">{translate(a.label)}</th>
              <td>
                {Math.round(a.score)} / 100 · {translate(a.tier)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pointer-events-none absolute inset-0">
        {axes.map((axis, i) => (
          <AxisCaption
            key={axis.label}
            variant={variant}
            axis={axis}
            index={i}
            count={axes.length}
            labelRadius={labelRadius}
            visible={labelsVisible}
          />
        ))}
      </div>

      {variant === "gallery" && <p className="pui-fig-cap">FIG. 01 — {translate("Performance profile")}</p>}
    </div>
  );
}

/* ── Editorial · the ink plate ─────────────────────────────────────────────── */

function EditorialPlate({ axes, radius, progress }: { axes: RadarAxis[]; radius: number; progress: number }) {
  return (
    <>
      <circle cx={CENTER} cy={CENTER} r={radius + 20} fill="none" stroke="rgb(var(--pui-accent-ink) / 0.55)" strokeWidth={1} />
      <circle cx={CENTER} cy={CENTER} r={radius + 13} fill="rgb(var(--pui-ed-paper))" />
      {[0.33, 0.66, 1].map((f) => (
        <circle key={f} cx={CENTER} cy={CENTER} r={radius * f} fill="none" stroke="rgb(var(--pui-ed-ink) / 0.12)" strokeWidth={0.75} />
      ))}
      <polygon
        points={scorePoints(axes, radius, progress)}
        fill="rgb(var(--pui-ed-ink) / 0.92)"
        stroke="rgb(var(--pui-ed-ink))"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
      {axes.map((axis, i) => {
        const clamped = Math.max(0, Math.min(100, axis.score));
        const { x, y } = polar((clamped / 100) * radius * progress, (i / axes.length) * Math.PI * 2);
        return <circle key={`pt-${i}`} cx={x} cy={y} r={2} fill="rgb(var(--pui-ed-paper))" />;
      })}
    </>
  );
}

/* ── Instrument · the scope ────────────────────────────────────────────────── */

function InstrumentScope({ axes, radius, progress }: { axes: RadarAxis[]; radius: number; progress: number }) {
  // Sweep beam: a 43° wedge, bright at its leading (top) edge, rotating once
  // every 8s. Hidden entirely under prefers-reduced-motion (see CSS).
  const trailing = polar(radius, -0.75);
  return (
    <>
      <defs>
        <linearGradient
          id="pui-scope-grad"
          gradientUnits="userSpaceOnUse"
          x1={CENTER}
          y1={CENTER - radius}
          x2={trailing.x}
          y2={trailing.y}
        >
          <stop offset="0" style={{ stopColor: "rgb(var(--brand))", stopOpacity: 0.38 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--brand))", stopOpacity: 0 }} />
        </linearGradient>
      </defs>

      {[0.25, 0.5, 0.75, 1].map((f) => (
        <circle
          key={f}
          cx={CENTER}
          cy={CENTER}
          r={radius * f}
          fill="none"
          stroke={`rgb(var(--brand) / ${f === 1 ? 0.4 : 0.16})`}
          strokeWidth={1}
        />
      ))}
      <line x1={CENTER - radius} y1={CENTER} x2={CENTER + radius} y2={CENTER} stroke="rgb(var(--brand) / 0.14)" strokeWidth={1} />
      <line x1={CENTER} y1={CENTER - radius} x2={CENTER} y2={CENTER + radius} stroke="rgb(var(--brand) / 0.14)" strokeWidth={1} />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const p1 = polar(radius - 4, a);
        const p2 = polar(radius, a);
        return <line key={`tick-${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgb(var(--brand) / 0.5)" strokeWidth={1} />;
      })}

      <g className="pui-scope-sweep">
        <path
          d={`M${CENTER},${CENTER} L${CENTER},${CENTER - radius} A${radius},${radius} 0 0 0 ${trailing.x},${trailing.y} Z`}
          fill="url(#pui-scope-grad)"
        >
          <animateTransform
            attributeName="transform"
            type="rotate"
            from={`0 ${CENTER} ${CENTER}`}
            to={`360 ${CENTER} ${CENTER}`}
            dur="8s"
            repeatCount="indefinite"
          />
        </path>
      </g>

      <polygon
        points={scorePoints(axes, radius, progress)}
        fill="rgb(var(--brand) / 0.12)"
        stroke="rgb(var(--brand) / 0.25)"
        strokeWidth={6}
        strokeLinejoin="round"
      />
      <polygon
        points={scorePoints(axes, radius, progress)}
        fill="none"
        stroke="rgb(var(--brand))"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
      {axes.map((axis, i) => {
        const clamped = Math.max(0, Math.min(100, axis.score));
        const { x, y } = polar((clamped / 100) * radius * progress, (i / axes.length) * Math.PI * 2);
        return <circle key={`pt-${i}`} cx={x} cy={y} r={3} fill="rgb(var(--bg-elev))" stroke="rgb(var(--brand))" strokeWidth={1.5} />;
      })}

      {/* Corner brackets frame the whole instrument. */}
      {[
        [6, 6, 1, 1],
        [314, 6, -1, 1],
        [6, 314, 1, -1],
        [314, 314, -1, -1],
      ].map(([x, y, dx, dy], i) => (
        <path
          key={`bracket-${i}`}
          d={`M${x + dx * 14},${y} L${x},${y} L${x},${y + dy * 14}`}
          fill="none"
          stroke="rgb(var(--brand) / 0.5)"
          strokeWidth={1.5}
        />
      ))}
    </>
  );
}

/* ── Gallery · the catalogue plate ─────────────────────────────────────────── */

function GalleryPlate({ axes, radius, progress }: { axes: RadarAxis[]; radius: number; progress: number }) {
  return (
    <>
      <circle cx={CENTER} cy={CENTER} r={radius} fill="none" stroke="rgb(var(--text) / 0.22)" strokeWidth={0.75} />
      <polygon
        points={scorePoints(axes, radius, progress)}
        fill="none"
        stroke="rgb(var(--text) / 0.8)"
        strokeWidth={1}
        strokeLinejoin="round"
      />
      {axes.map((axis, i) => {
        const clamped = Math.max(0, Math.min(100, axis.score));
        const { x, y } = polar((clamped / 100) * radius * progress, (i / axes.length) * Math.PI * 2);
        return <circle key={`pt-${i}`} cx={x} cy={y} r={1.8} fill="rgb(var(--text))" />;
      })}
    </>
  );
}

/* ── Arena · the rating card ───────────────────────────────────────────────── */

function ArenaRating({ axes, radius, progress }: { axes: RadarAxis[]; radius: number; progress: number }) {
  const count = axes.length;
  return (
    <>
      <defs>
        <radialGradient id="pui-arena-fill" gradientUnits="userSpaceOnUse" cx={CENTER} cy={CENTER} r={radius}>
          <stop offset="0" style={{ stopColor: "rgb(var(--pui-gold))", stopOpacity: 0.2 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--pui-gold))", stopOpacity: 0.55 }} />
        </radialGradient>
        <radialGradient id="pui-arena-glow" gradientUnits="userSpaceOnUse" cx={CENTER} cy={CENTER} r={radius + 28}>
          <stop offset="0" style={{ stopColor: "rgb(var(--pui-gold))", stopOpacity: 0.12 }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--pui-gold))", stopOpacity: 0 }} />
        </radialGradient>
      </defs>

      <circle cx={CENTER} cy={CENTER} r={radius + 28} fill="url(#pui-arena-glow)" />
      {[0.33, 0.66, 1].map((f) => (
        <polygon
          key={f}
          points={ringPoints(radius * f, count)}
          fill="none"
          stroke={`rgb(var(--pui-accent-ink) / ${f === 1 ? 0.32 : 0.14})`}
          strokeWidth={1.25}
        />
      ))}
      {axes.map((_, i) => {
        const { x, y } = polar(radius, (i / count) * Math.PI * 2);
        return <line key={`spoke-${i}`} x1={CENTER} y1={CENTER} x2={x} y2={y} stroke="rgb(var(--pui-accent-ink) / 0.18)" strokeWidth={1.5} />;
      })}
      <polygon
        points={scorePoints(axes, radius, progress)}
        fill="url(#pui-arena-fill)"
        stroke="rgb(var(--pui-accent-ink))"
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </>
  );
}

/* ── Shared caption layer ──────────────────────────────────────────────────── */

function AxisCaption({
  variant,
  axis,
  index,
  count,
  labelRadius,
  visible,
}: {
  variant: Variant;
  axis: RadarAxis;
  index: number;
  count: number;
  labelRadius: number;
  visible: boolean;
}) {
  const { translate } = useLocale();
  const theta = (index / count) * Math.PI * 2;
  const { x, y } = polar(labelRadius, theta);
  const leftPct = Number(((x / VIEW) * 100).toFixed(3));
  const topPct = Number(((y / VIEW) * 100).toFixed(3));
  const clamped = Math.max(0, Math.min(100, Math.round(axis.score)));

  return (
    <div
      className={`pui-radar-axis${variant === "arena" && topPct < 50 ? " is-flipped" : ""}`}
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: "translate(-50%, -50%)",
        opacity: visible ? 1 : 0,
        transition: "opacity 420ms var(--ease)",
        transitionDelay: `${index * 40}ms`,
      }}
      title={axis.rawText?.trim() ? axis.rawText : undefined}
    >
      {variant === "arena" ? (
        <>
          <span className="pui-radar-chip">{clamped}</span>
          <p className="pui-radar-lab">{translate(axis.label)}</p>
        </>
      ) : (
        <>
          <p className="pui-radar-lab">{translate(axis.label)}</p>
          <span className="pui-radar-val">{variant === "instrument" ? `[${clamped}]` : clamped}</span>
        </>
      )}
    </div>
  );
}
