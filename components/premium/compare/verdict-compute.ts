// Shared verdict math for the premium (re-designed) verdicts. The standard
// CompareVerdict computes this inline; we replicate it here as a pure helper so
// the four theme-specific verdict designs (pull-quote / diagnostic / pedestal /
// scoreboard) all render the SAME conclusion in their own form — without touching
// the shared standard component. Mirrors compare-verdict.tsx exactly.

import type { Shoe } from "@/lib/types";
import { METRICS, type MetricKey, scoreFor } from "@/components/compare/compare-metrics";

const EVEN_MATCH_GAP = 3;

export type VerdictData = {
  ok: boolean; // false when < 2 shoes
  averages: { id: string; name: string; slug: string; avg: number }[]; // sorted desc
  gap: number;
  evenMatch: boolean;
  winnerIndex: number; // index into the ORIGINAL shoes array
  scenarios: { id: string; name: string; metrics: MetricKey[] }[]; // sorted by count desc
  mentionedMetrics: MetricKey[];
};

export function computeVerdict(shoes: Shoe[]): VerdictData {
  const empty: VerdictData = { ok: false, averages: [], gap: 0, evenMatch: true, winnerIndex: 0, scenarios: [], mentionedMetrics: [] };
  if (shoes.length < 2) return empty;

  const averages = shoes
    .map((shoe) => {
      const scores = METRICS.map((m) => scoreFor(shoe, m.key));
      return { id: shoe.id, name: shoe.shoe_name, slug: shoe.slug, avg: scores.reduce((a, b) => a + b, 0) / scores.length };
    })
    .sort((a, b) => b.avg - a.avg);

  const gap = averages[0].avg - averages[1].avg;
  const evenMatch = gap < EVEN_MATCH_GAP;
  const winnerIndex = Math.max(0, shoes.findIndex((s) => s.id === averages[0].id));

  const byLeader = new Map<string, { id: string; name: string; metrics: MetricKey[] }>();
  for (const metric of METRICS) {
    const scores = shoes.map((shoe) => ({ id: shoe.id, name: shoe.shoe_name, score: scoreFor(shoe, metric.key) }));
    const top = scores.reduce((best, cur) => (cur.score > best.score ? cur : best), scores[0]);
    if (scores.filter((s) => s.score === top.score).length > 1) continue; // tie → skip
    const entry = byLeader.get(top.id) ?? { id: top.id, name: top.name, metrics: [] };
    entry.metrics.push(metric.key);
    byLeader.set(top.id, entry);
  }
  const scenarios = Array.from(byLeader.values()).sort((a, b) => b.metrics.length - a.metrics.length);
  const mentioned = new Set<MetricKey>();
  scenarios.forEach((s) => s.metrics.forEach((m) => mentioned.add(m)));
  const mentionedMetrics = METRICS.filter((m) => mentioned.has(m.key)).map((m) => m.key);

  return { ok: true, averages, gap, evenMatch, winnerIndex, scenarios, mentionedMetrics };
}

export function metricLabel(key: MetricKey): string {
  return METRICS.find((m) => m.key === key)?.label ?? key;
}
