"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import type { RecommendationItem, WebReference } from "@/lib/ai/types";

// All web sources cited across a turn's recommendations, de-duplicated by URL and
// shown once — references live in a single place instead of being repeated on
// every card.
export function ReferencesList({ recommendations }: { recommendations: RecommendationItem[] }) {
  const { translate } = useLocale();

  const seen = new Set<string>();
  const refs: WebReference[] = [];
  for (const rec of recommendations) {
    for (const ref of rec.references ?? []) {
      if (!ref?.url || seen.has(ref.url)) continue;
      seen.add(ref.url);
      refs.push(ref);
    }
  }
  if (!refs.length) return null;

  return (
    <div className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.4)] bg-[rgb(var(--surface)/0.5)] px-3 py-2.5">
      <p className="mb-1 text-[0.66rem] font-semibold uppercase tracking-[0.12em] soft-text">{translate("References")}</p>
      <ul className="space-y-1">
        {refs.map((ref, i) => (
          <li key={i} className="flex gap-1.5 text-[0.76rem] leading-snug">
            <span className="shrink-0 soft-text">[{i + 1}]</span>
            <a
              href={ref.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 truncate text-[rgb(var(--text))] underline-offset-2 hover:underline"
              title={ref.url}
            >
              {ref.title}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
