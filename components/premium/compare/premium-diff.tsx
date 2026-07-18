"use client";

// The per-metric comparison, re-designed per theme (not the shared bar list):
//   • Editorial → a typographic LEAGUE TABLE (ranked names + scores, gold leader).
//   • Instrument → CHANNEL METERS (mono label + cyan bar + value per shoe).
//   • Gallery → QUIET LINES (hairline bars, grayscale, maximum air).
//   • Arena → POWER BARS (bold score-toned bars, big numerals, leader crowned).
// Same METRICS + scoreFor data as the standard CompareDiffRows. Kept legible on
// mobile (labels ≥ 0.7rem, single-column rows, no clipped numerals).

import { METRICS, identityColor, scoreFor, type MetricKey } from "@/components/compare/compare-metrics";
import { scoreColor } from "@/lib/score-tone";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Shoe } from "@/lib/types";
import type { PremiumVariant } from "@/components/premium/variants";

type Variant = Exclude<PremiumVariant, "standard">;
type Props = { variant: Variant; shoes: Shoe[] };

type Ranked = { id: string; name: string; score: number; index: number };

function rankFor(shoes: Shoe[], key: MetricKey): Ranked[] {
  return shoes
    .map((s, index) => ({ id: s.id, name: s.shoe_name, score: scoreFor(s, key), index }))
    .sort((a, b) => b.score - a.score);
}

export function PremiumDiff({ variant, shoes }: Props) {
  const { translate } = useLocale();
  if (shoes.length < 2) return null;
  const rows = METRICS.map((m) => ({ key: m.key, label: translate(m.label), ranked: rankFor(shoes, m.key) }));

  if (variant === "editorial") {
    return (
      <div className="pui-league">
        {rows.map((r) => (
          <div key={r.key} className="pui-league-row">
            <p className="pui-league-metric">{r.label}</p>
            <ol className="pui-league-list">
              {r.ranked.map((s, i) => (
                <li key={s.id} className={i === 0 ? "is-lead" : ""}>
                  <span className="pui-league-rank">{i + 1}</span>
                  <span className="pui-league-name">{s.name}</span>
                  <span className="pui-league-score">{s.score}</span>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "instrument") {
    return (
      <div className="pui-meters">
        {rows.map((r) => (
          <div key={r.key} className="pui-meters-block">
            <p className="pui-meters-metric">{r.label}</p>
            {r.ranked.map((s, i) => (
              <div key={s.id} className="pui-meters-row">
                <span className="pui-meters-name">{s.name}</span>
                <span className="pui-meters-bar"><span style={{ width: `${Math.max(2, s.score)}%`, opacity: i === 0 ? 1 : 0.55 }} /></span>
                <span className="pui-meters-val">{s.score}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "gallery") {
    return (
      <div className="pui-qlines">
        {rows.map((r) => (
          <div key={r.key} className="pui-qlines-block">
            <p className="pui-qlines-metric">{r.label}</p>
            {r.ranked.map((s, i) => (
              <div key={s.id} className="pui-qlines-row">
                <span className={`pui-qlines-name ${i === 0 ? "is-lead" : ""}`}>{s.name}</span>
                <span className="pui-qlines-bar"><span style={{ width: `${Math.max(2, s.score)}%`, opacity: i === 0 ? 0.85 : 0.4 }} /></span>
                <span className="pui-qlines-val">{s.score}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  // arena — power bars
  return (
    <div className="pui-power">
      {rows.map((r) => (
        <div key={r.key} className="pui-power-block">
          <p className="pui-power-metric">{r.label}</p>
          {r.ranked.map((s, i) => (
            <div key={s.id} className="pui-power-row">
              <span className="pui-power-name">
                {i === 0 ? <span aria-hidden className="pui-power-crown" style={{ background: identityColor(s.index) }} /> : <span className="pui-power-dot" style={{ background: identityColor(s.index) }} />}
                {s.name}
              </span>
              <span className="pui-power-bar"><span style={{ width: `${Math.max(3, s.score)}%`, background: i === 0 ? scoreColor(s.score) : scoreColor(s.score, 0.5) }} /></span>
              <span className="pui-power-val" style={{ color: i === 0 ? scoreColor(s.score) : undefined }}>{s.score}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
