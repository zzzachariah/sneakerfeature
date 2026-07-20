"use client";

// The cushion-life meter, drawn differently per variant (same data):
//   • standard — a plain rounded progress bar tinted by status.
//   • editorial — a printed "mileage" rule: thin ink track, serif italic
//     caption, the fill pressed in ink.
//   • instrument — 12 LED segments with a glow, mono percentage readout.
//   • gallery — one hairline with a platinum position dot and a tiny figure.
//   • arena — a broadcast stat bar: gold gradient fill, condensed % chip.
// The fill animates from zero when the meter scrolls into view (respects
// prefers-reduced-motion via useProgress).

import { useInView, useProgress } from "@/components/motion/use-progress";
import type { PremiumVariant } from "@/components/premium/variants";
import type { WearStatus } from "@/lib/closet/wear";

const SEGMENTS = 12;

export function WearMeter({
  variant,
  ratio,
  status,
  label
}: {
  variant: PremiumVariant;
  ratio: number;
  status: WearStatus;
  label: string;
}) {
  const { ref, inView } = useInView<HTMLDivElement>(0.4, { repeat: false });
  const progress = useProgress(inView);
  const clamped = Math.max(0, Math.min(1, ratio));
  const shown = clamped * progress;
  const pct = Math.round(clamped * 100);

  if (variant === "instrument") {
    const lit = Math.round(shown * SEGMENTS);
    return (
      <div ref={ref} className="pui-meter pui-meter--instrument" data-status={status} role="img" aria-label={`${label} — ${pct}%`}>
        <div className="pui-meter-leds" aria-hidden>
          {Array.from({ length: SEGMENTS }, (_, i) => (
            <span key={i} className={`pui-meter-led${i < lit ? " is-lit" : ""}`} style={{ transitionDelay: `${i * 28}ms` }} />
          ))}
        </div>
        <span className="pui-meter-read" aria-hidden>
          [{String(pct).padStart(2, "0")}%]
        </span>
      </div>
    );
  }

  if (variant === "gallery") {
    return (
      <div ref={ref} className="pui-meter pui-meter--gallery" data-status={status} role="img" aria-label={`${label} — ${pct}%`}>
        <span className="pui-meter-hairline" aria-hidden>
          <span className="pui-meter-dot" style={{ left: `${shown * 100}%` }} />
        </span>
        <span className="pui-meter-fig" aria-hidden>
          {pct}
        </span>
      </div>
    );
  }

  // standard / editorial / arena share a track+fill skeleton; CSS reshapes it.
  return (
    <div ref={ref} className={`pui-meter pui-meter--${variant}`} data-status={status} role="img" aria-label={`${label} — ${pct}%`}>
      {variant === "editorial" ? <span className="pui-meter-cap" aria-hidden>{label}</span> : null}
      <span className="pui-meter-track" aria-hidden>
        <span className="pui-meter-fill" style={{ width: `${shown * 100}%` }} />
      </span>
      {variant === "arena" ? (
        <span className="pui-meter-chip num-display" aria-hidden>
          {pct}%
        </span>
      ) : (
        <span className="pui-meter-pct num-display" aria-hidden>
          {pct}%
        </span>
      )}
    </div>
  );
}
