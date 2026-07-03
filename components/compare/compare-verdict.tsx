"use client";

import { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { useInView } from "@/components/motion/use-progress";
import { METRICS, MetricKey, scoreFor } from "@/components/compare/compare-metrics";

// Plain-language, on-court meaning of each metric — rendered as a small
// legend so newcomers know what a "traction lead" actually buys them.
const METRIC_HINTS: Record<MetricKey, string> = {
  cushioning_feel: "how well landings are absorbed and impact is protected",
  court_feel: "how directly you feel the floor for quick first steps",
  bounce: "energy return on jumps and sprints",
  stability: "lateral support that keeps you safe on hard cuts",
  traction: "grip reliability on stops and direction changes",
  fit: "lockdown, containment and step-in comfort"
};

// Average-score gap (0–100 scale) below which we call the matchup even
// instead of crowning an overall pick.
const EVEN_MATCH_GAP = 3;

type Props = {
  shoes: Shoe[];
  /** Slide-active flag — replays the reveal on each slide entry. */
  active?: boolean;
};

export function CompareVerdict({ shoes, active }: Props) {
  const { translate, locale } = useLocale();
  const { ref, inView } = useInView<HTMLDivElement>();
  const triggered = active ?? inView;

  if (!shoes.length) return null;

  if (shoes.length < 2) {
    return (
      <Shell ref={ref} triggered={triggered} translate={translate}>
        <p className="text-[0.8rem] leading-[1.5] text-[rgb(var(--text)/0.8)]">
          {translate("Only one shoe selected — add another to compare.")}
        </p>
      </Shell>
    );
  }

  // Overall standing: average of the six metric scores per shoe.
  const averages = shoes
    .map((shoe) => {
      const scores = METRICS.map((metric) => scoreFor(shoe, metric.key));
      return { id: shoe.id, name: shoe.shoe_name, avg: scores.reduce((a, b) => a + b, 0) / scores.length };
    })
    .sort((a, b) => b.avg - a.avg);
  const gap = averages[0].avg - averages[1].avg;
  const evenMatch = gap < EVEN_MATCH_GAP;

  // Per-metric leaders (ties excluded), grouped by shoe for scenario advice.
  const byLeader = new Map<string, { name: string; metrics: MetricKey[] }>();
  for (const metric of METRICS) {
    const scores = shoes.map((shoe) => ({ id: shoe.id, name: shoe.shoe_name, score: scoreFor(shoe, metric.key) }));
    const top = scores.reduce((best, cur) => (cur.score > best.score ? cur : best), scores[0]);
    if (scores.filter((s) => s.score === top.score).length > 1) continue;
    const entry = byLeader.get(top.id) ?? { name: top.name, metrics: [] };
    entry.metrics.push(metric.key);
    byLeader.set(top.id, entry);
  }
  const scenarios = Array.from(byLeader.values()).sort((a, b) => b.metrics.length - a.metrics.length);
  const mentionedMetrics = METRICS.filter((m) => scenarios.some((s) => s.metrics.includes(m.key)));

  const metricLabel = (key: MetricKey) => {
    const metric = METRICS.find((m) => m.key === key);
    return metric ? translate(metric.label) : key;
  };

  return (
    <Shell ref={ref} triggered={triggered} translate={translate}>
      {/* Overall winner badge + gap (or evenly-matched call) */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold tracking-[0.02em] ${
            evenMatch
              ? "border-[rgb(var(--muted)/0.4)] text-[rgb(var(--text)/0.75)]"
              : "border-[rgb(var(--text)/0.25)] bg-[rgb(var(--text)/0.05)] text-[rgb(var(--text))]"
          }`}
        >
          {evenMatch ? translate("Evenly matched") : `${averages[0].name} · ${translate("has the overall edge")}`}
        </span>
        <span className="num-display text-[0.66rem] soft-text">
          {translate("avg score")} {Math.round(averages[0].avg)} vs {Math.round(averages[1].avg)}
        </span>
      </div>
      <p className="mb-3 text-[0.72rem] leading-[1.55] text-[rgb(var(--subtext)/0.9)]">
        {evenMatch
          ? translate("Averages are within a couple of points — let the scenarios below decide.")
          : translate("Higher average across all six metrics — the safer pick if you want balance.")}
      </p>

      {/* Scenario-based buying advice */}
      {scenarios.length === 0 ? (
        <p className="text-[0.8rem] leading-[1.5] text-[rgb(var(--text)/0.8)]">
          {translate("Every metric is tied — these shoes are evenly matched.")}
        </p>
      ) : (
        <div className="space-y-2">
          {scenarios.map((entry, i) => (
            <p key={i} className="text-[0.8rem] leading-[1.55] tracking-[-0.005em] text-[rgb(var(--text)/0.85)]">
              {translate("If you care most about")}{" "}
              <span className="font-medium text-[rgb(var(--text))]">
                {entry.metrics.map((key) => metricLabel(key).toLowerCase()).join(locale === "zh" ? "、" : ", ")}
              </span>{" "}
              — {translate("pick")} <strong className="tracking-[-0.01em] text-[rgb(var(--text))]">{entry.name}</strong>
            </p>
          ))}
        </div>
      )}

      {/* Metric legend — what each mentioned lead means on court */}
      {mentionedMetrics.length > 0 ? (
        <div className="mt-3.5 space-y-1 border-t border-[rgb(var(--muted)/0.2)] pt-3">
          {mentionedMetrics.map((metric) => (
            <p key={metric.key} className="text-[0.66rem] leading-[1.5] text-[rgb(var(--subtext)/0.8)]">
              <span className="font-medium text-[rgb(var(--subtext))]">{translate(metric.label)}</span>
              {" · "}
              {translate(METRIC_HINTS[metric.key])}
            </p>
          ))}
        </div>
      ) : null}
    </Shell>
  );
}

function Shell({
  ref,
  triggered,
  translate,
  children
}: {
  ref: React.Ref<HTMLDivElement>;
  triggered: boolean;
  translate: (value: string) => string;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={ref}
      className="mt-6 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.32)] bg-[rgb(var(--surface)/0.7)] px-4 py-3.5 transition-opacity duration-500"
      style={{ opacity: triggered ? 1 : 0, transitionDelay: "200ms" }}
    >
      <p className="t-eyebrow mb-2">{translate("Verdict")}</p>
      {children}
    </div>
  );
}
