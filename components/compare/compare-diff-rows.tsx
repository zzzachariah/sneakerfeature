"use client";

import { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { useInView } from "@/components/motion/use-progress";
import { METRICS, MetricKey, scoreFor } from "@/components/compare/compare-metrics";
import { scoreColor } from "@/lib/score-tone";

type Props = {
  shoes: Shoe[];
  /** Slide-active flag — replays the row + bar reveal on each slide entry. */
  active?: boolean;
};

export function CompareDiffRows({ shoes, active }: Props) {
  const { translate } = useLocale();
  const { ref, inView } = useInView<HTMLDivElement>();
  const triggered = active ?? inView;

  if (!shoes.length) return null;

  const paired = shoes.length === 2;

  return (
    <div ref={ref}>
      {paired ? (
        <PairedHeader shoes={shoes} />
      ) : (
        <MultiHeader shoes={shoes} />
      )}

      <div>
        {METRICS.map((metric, i) => (
          <MetricRow
            key={metric.key}
            label={translate(metric.label)}
            shoes={shoes}
            metricKey={metric.key}
            paired={paired}
            triggered={triggered}
            delay={i * 55}
          />
        ))}
      </div>

      <Verdict shoes={shoes} triggered={triggered} />
    </div>
  );
}

function PairedHeader({ shoes }: { shoes: Shoe[] }) {
  const { translate } = useLocale();
  return (
    <div className="mb-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[rgb(var(--muted)/0.25)] pb-3">
      <span className="text-right text-[0.73rem] font-bold tracking-[-0.01em]">{shoes[0].shoe_name}</span>
      <span className="t-eyebrow min-w-[68px] text-center">{translate("vs")}</span>
      <span className="text-[0.73rem] font-bold tracking-[-0.01em]">{shoes[1].shoe_name}</span>
    </div>
  );
}

function MultiHeader({ shoes }: { shoes: Shoe[] }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[rgb(var(--muted)/0.25)] pb-3">
      {shoes.map((shoe, i) => (
        <span key={shoe.id} className="text-[0.72rem] tracking-[-0.01em]">
          <span className="font-bold text-[rgb(var(--text))]">{shoe.shoe_name}</span>
          {i < shoes.length - 1 ? <span className="ml-3 soft-text">·</span> : null}
        </span>
      ))}
    </div>
  );
}

function MetricRow({
  label,
  shoes,
  metricKey,
  paired,
  triggered,
  delay
}: {
  label: string;
  shoes: Shoe[];
  metricKey: MetricKey;
  paired: boolean;
  triggered: boolean;
  delay: number;
}) {
  const scores = shoes.map((shoe) => scoreFor(shoe, metricKey));
  const max = Math.max(...scores);

  if (paired) {
    const [sA, sB] = scores;
    return (
      <div
        className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-[rgb(var(--muted)/0.18)] py-2.5 transition-[opacity,transform] duration-500"
        style={{
          opacity: triggered ? 1 : 0,
          transform: triggered ? "none" : "translateY(6px)",
          transitionDelay: `${delay}ms`
        }}
      >
        <div className="flex items-center justify-end gap-3">
          <span
            className={`num-display text-[0.78rem] ${sA >= sB ? "font-semibold" : ""}`}
            style={{ color: sA >= sB ? scoreColor(sA) : scoreColor(sA, 0.6) }}
          >
            {sA}
          </span>
          <Bar score={sA} win={sA > sB} right triggered={triggered} delay={delay + 80} />
        </div>
        <span className="text-center text-[0.62rem] uppercase tracking-[0.16em] soft-text">{label}</span>
        <div className="flex items-center gap-3">
          <Bar score={sB} win={sB > sA} triggered={triggered} delay={delay + 80} />
          <span
            className={`num-display text-[0.78rem] ${sB >= sA ? "font-semibold" : ""}`}
            style={{ color: sB >= sA ? scoreColor(sB) : scoreColor(sB, 0.6) }}
          >
            {sB}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="border-b border-[rgb(var(--muted)/0.18)] py-3 transition-[opacity,transform] duration-500"
      style={{
        opacity: triggered ? 1 : 0,
        transform: triggered ? "none" : "translateY(6px)",
        transitionDelay: `${delay}ms`
      }}
    >
      <p className="mb-1.5 text-[0.62rem] uppercase tracking-[0.16em] soft-text">{label}</p>
      <div className="space-y-1">
        {shoes.map((shoe, i) => {
          const score = scores[i];
          const isLeader = score === max && score > 0;
          return (
            <div key={shoe.id} className="grid grid-cols-[minmax(0,1fr)_100px_36px] items-center gap-3">
              <span
                className={`truncate text-[0.72rem] ${isLeader ? "font-semibold text-[rgb(var(--text))]" : "soft-text"}`}
              >
                {shoe.shoe_name}
              </span>
              <Bar score={score} win={isLeader} triggered={triggered} delay={delay + 80 + i * 40} />
              <span
                className={`num-display text-right text-[0.72rem] ${isLeader ? "font-semibold" : ""}`}
                style={{ color: isLeader ? scoreColor(score) : scoreColor(score, 0.6) }}
              >
                {score}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Bar({
  score,
  win,
  right,
  triggered,
  delay
}: {
  score: number;
  win: boolean;
  right?: boolean;
  triggered: boolean;
  delay: number;
}) {
  return (
    <div
      className="h-[3px] w-[100px] shrink-0 overflow-hidden rounded-full"
      style={{ background: "rgb(var(--muted) / 0.28)" }}
    >
      <div
        className="h-full rounded-full"
        style={{
          width: triggered ? `${Math.max(2, score)}%` : "0%",
          background: win ? scoreColor(score) : scoreColor(score, 0.4),
          marginLeft: right ? "auto" : undefined,
          transition: "width 500ms cubic-bezier(0.22, 1, 0.36, 1)",
          transitionDelay: `${delay}ms`
        }}
      />
    </div>
  );
}

function Verdict({ shoes, triggered }: { shoes: Shoe[]; triggered: boolean }) {
  const { translate } = useLocale();

  if (shoes.length < 2) {
    return (
      <div
        className="mt-5 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.32)] bg-[rgb(var(--surface)/0.7)] px-4 py-3.5 transition-opacity duration-500"
        style={{ opacity: triggered ? 1 : 0, transitionDelay: "500ms" }}
      >
        <p className="t-eyebrow mb-2">{translate("Verdict")}</p>
        <p className="text-[0.8rem] leading-[1.5] text-[rgb(var(--text)/0.8)]">
          {translate("Only one shoe selected — add another to compare.")}
        </p>
      </div>
    );
  }

  const leaderByMetric = METRICS.map((metric) => {
    const scores = shoes.map((shoe) => ({ id: shoe.id, name: shoe.shoe_name, score: scoreFor(shoe, metric.key) }));
    const top = scores.reduce((best, cur) => (cur.score > best.score ? cur : best), scores[0]);
    const tied = scores.filter((s) => s.score === top.score).length > 1;
    return { metric, leader: tied ? null : top };
  });

  const byLeader = new Map<string, { name: string; metrics: string[] }>();
  for (const { metric, leader } of leaderByMetric) {
    if (!leader) continue;
    const entry = byLeader.get(leader.id) ?? { name: leader.name, metrics: [] };
    entry.metrics.push(translate(metric.label).toLowerCase());
    byLeader.set(leader.id, entry);
  }

  const ranked = Array.from(byLeader.values()).sort((a, b) => b.metrics.length - a.metrics.length);

  return (
    <div
      className="mt-5 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.32)] bg-[rgb(var(--surface)/0.7)] px-4 py-3.5 transition-opacity duration-500"
      style={{ opacity: triggered ? 1 : 0, transitionDelay: "500ms" }}
    >
      <p className="t-eyebrow mb-2">{translate("Verdict")}</p>
      {ranked.length === 0 ? (
        <p className="text-[0.8rem] leading-[1.5] text-[rgb(var(--text)/0.8)]">
          {translate("Every metric is tied — these shoes are evenly matched.")}
        </p>
      ) : (
        <div className="space-y-1.5">
          {ranked.map((entry, i) => (
            <p key={i} className="text-[0.8rem] leading-[1.5] tracking-[-0.005em] text-[rgb(var(--text)/0.8)]">
              <strong className="tracking-[-0.01em] text-[rgb(var(--text))]">{entry.name}</strong>{" "}
              {translate("leads in")} <span className="num-display">{entry.metrics.length}</span>{" "}
              {entry.metrics.length === 1 ? translate("metric") : translate("metrics")}{" "}
              <span className="soft-text">({entry.metrics.join(", ")})</span>.
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
