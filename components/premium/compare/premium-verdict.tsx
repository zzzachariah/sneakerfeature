"use client";

// The verdict, re-designed as a different OBJECT per theme (not the same card
// recolored) — matching the kits the design gallery locked in:
//   • Editorial → a magazine PULL-QUOTE (big serif call + attribution).
//   • Instrument → a DIAGNOSTIC readout (mono terminal line + metric bars).
//   • Gallery → a PEDESTAL statement (one quiet line + one name, max air).
//   • Arena → a SCOREBOARD (WINS / EVENLY MATCHED + the scoreline).
// All four read the SAME computed conclusion (verdict-compute.ts) so the numbers
// stay honest. Standard users never reach this — they get CompareVerdict.

import { useLocale } from "@/components/i18n/locale-provider";
import { METRICS, scoreFor } from "@/components/compare/compare-metrics";
import { computeVerdict, metricLabel } from "@/components/premium/compare/verdict-compute";
import type { Shoe } from "@/lib/types";
import type { PremiumVariant } from "@/components/premium/variants";

type Props = { variant: Exclude<PremiumVariant, "standard">; shoes: Shoe[] };

export function PremiumVerdict({ variant, shoes }: Props) {
  const { translate, locale } = useLocale();
  const v = computeVerdict(shoes);
  if (!v.ok) return null;
  const sep = locale === "zh" ? "、" : ", ";
  const winner = v.averages[0];
  const a0 = Math.round(v.averages[0].avg);
  const a1 = Math.round(v.averages[1].avg);

  if (variant === "editorial") return <EditorialVerdict v={v} translate={translate} sep={sep} shoes={shoes} a0={a0} a1={a1} />;
  if (variant === "instrument") return <InstrumentVerdict v={v} translate={translate} shoes={shoes} a0={a0} a1={a1} />;
  if (variant === "gallery") return <GalleryVerdict v={v} translate={translate} a0={a0} a1={a1} />;
  return <ArenaVerdict v={v} translate={translate} a0={a0} a1={a1} winnerName={winner.name} />;
}

type V = ReturnType<typeof computeVerdict>;

/* Editorial — magazine pull-quote. */
function EditorialVerdict({ v, translate, sep, shoes, a0, a1 }: { v: V; translate: (s: string) => string; sep: string; shoes: Shoe[]; a0: number; a1: number }) {
  const lead = v.evenMatch
    ? translate("A dead heat.")
    : `${v.averages[0].name} ${translate("takes it.")}`;
  return (
    <blockquote className="pui-vq">
      <p className="pui-vq-lead">{lead}</p>
      {v.scenarios.length > 0 ? (
        <div className="pui-vq-body">
          {v.scenarios.slice(0, 3).map((s) => (
            <p key={s.id}>
              {translate("If you care most about")}{" "}
              <em>{s.metrics.map((k) => metricLabel(k)).map((l) => translate(l).toLowerCase()).join(sep)}</em>
              {" — "}
              {translate("pick")} <strong>{s.name}</strong>.
            </p>
          ))}
        </div>
      ) : null}
      <footer className="pui-vq-attr">
        {translate("The verdict")} · {translate("avg score")} {a0} {translate("vs")} {a1}
      </footer>
    </blockquote>
  );
}

/* Instrument — diagnostic terminal + metric bars. */
function InstrumentVerdict({ v, translate, shoes, a0, a1 }: { v: V; translate: (s: string) => string; shoes: Shoe[]; a0: number; a1: number }) {
  const rows = METRICS.map((m) => {
    const scores = shoes.map((s) => ({ name: s.shoe_name, score: scoreFor(s, m.key) }));
    const top = scores.reduce((b, c) => (c.score > b.score ? c : b), scores[0]);
    return { key: m.key, label: translate(m.label), name: top.name, score: top.score };
  });
  const result = v.evenMatch ? "EVENLY_MATCHED" : v.averages[0].name.toUpperCase().replace(/\s+/g, "_");
  return (
    <div className="pui-diag">
      <p className="pui-diag-line">&gt; {translate("RESULT")}: {result}</p>
      <div className="pui-diag-rows">
        {rows.map((r) => (
          <div key={r.key} className="pui-diag-row">
            <span className="pui-diag-k">{r.label}</span>
            <span className="pui-diag-bar"><span style={{ width: `${r.score}%` }} /></span>
            <span className="pui-diag-v">{r.score}</span>
            <span className="pui-diag-n">→ {r.name}</span>
          </div>
        ))}
      </div>
      <p className="pui-diag-foot">{translate("AVG")} {a0} / {a1}</p>
    </div>
  );
}

/* Gallery — a pedestal statement: one line, one name, maximum air. */
function GalleryVerdict({ v, translate, a0, a1 }: { v: V; translate: (s: string) => string; a0: number; a1: number }) {
  return (
    <div className="pui-pedv">
      <p className="pui-pedv-kicker">{translate("Our pick")}</p>
      <p className="pui-pedv-name">{v.evenMatch ? translate("Evenly matched") : v.averages[0].name}</p>
      <p className="pui-pedv-sub">
        {v.evenMatch ? translate("decide by what you value") : translate("by the narrowest margin")} · {a0}/{a1}
      </p>
    </div>
  );
}

/* Arena — a scoreboard. */
function ArenaVerdict({ v, translate, a0, a1, winnerName }: { v: V; translate: (s: string) => string; a0: number; a1: number; winnerName: string }) {
  const lead = leadMetric(v, translate);
  return (
    <div className="pui-score">
      <div className="pui-score-head">— {translate("Decision")} —</div>
      <div className="pui-score-body">
        <p className="pui-score-win">{v.evenMatch ? translate("Evenly matched") : `${winnerName} ${translate("WINS")}`}</p>
        <p className="pui-score-line">
          {a0} <span className="pui-score-dash">–</span> {a1}
          {lead ? <span className="pui-score-tag"> · {lead}</span> : null}
        </p>
      </div>
    </div>
  );
}

function leadMetric(v: V, translate: (s: string) => string): string | null {
  const first = v.scenarios[0];
  if (!first || first.metrics.length === 0) return null;
  return translate(metricLabel(first.metrics[0])).toLowerCase();
}
