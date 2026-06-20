"use client";

import { useMemo } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  type FacetState,
  type CategoryBucket,
  type EraBucket,
  type PerfFlag,
  CATEGORY_BUCKETS,
  ERA_BUCKETS,
  PERF_FLAGS,
  EMPTY_FACETS,
  availableFacets
} from "@/lib/filters/shoe-facets";
import type { Shoe } from "@/lib/types";

const CATEGORY_LABEL: Record<CategoryBucket, string> = {
  guard: "Guards",
  wing: "Wings",
  big: "Bigs",
  all: "All-around"
};
const ERA_LABEL: Record<EraBucket, string> = {
  pre2010: "Before 2010",
  "2010s": "2010s",
  "2020s": "2020s"
};
const PERF_LABEL: Record<PerfFlag, string> = {
  traction: "Great traction",
  cushion: "Plush cushioning",
  bounce: "Bouncy",
  court: "Great court feel",
  stable: "Stable",
  fit: "Locked-in fit",
  light: "Lightweight"
};
const RATING_OPTIONS = [3, 4, 4.5];

function Chip({
  active,
  onClick,
  children
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  // NOTE: intentionally no .glass-interactive — the "clean skin" override forces
  // a surface background on it, which would wipe out the active (dark) state on
  // web/Android. Plain transition + active:scale gives the press feel safely.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[0.75rem] font-medium leading-none transition duration-150 active:scale-95 ${
        active
          ? "border-[rgb(var(--text))] bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
          : "border-[rgb(var(--glass-stroke-soft)/0.55)] text-[rgb(var(--subtext))] hover:border-[rgb(var(--text)/0.35)] hover:text-[rgb(var(--text))]"
      }`}
    >
      {children}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[0.62rem] uppercase tracking-[0.16em] soft-text">{title}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export function ShoeFacets({
  shoes,
  facets,
  onChange,
  bare = false
}: {
  shoes: Shoe[];
  facets: FacetState;
  onChange: (next: FacetState) => void;
  /** Drop the glass panel chrome — used inside the mobile filter bottom sheet. */
  bare?: boolean;
}) {
  const { translate } = useLocale();
  const available = useMemo(() => availableFacets(shoes), [shoes]);

  const toggle = <T,>(arr: T[], v: T): T[] => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  const categories = CATEGORY_BUCKETS.filter((b) => available.categories.has(b));
  const eras = ERA_BUCKETS.filter((b) => available.eras.has(b));
  const perfFlags = PERF_FLAGS.filter((f) => f !== "light" || available.hasWeight);

  return (
    <div className={bare ? "" : "glass glass-clip mb-3 rounded-2xl p-4"}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {categories.length > 0 && (
          <Group title={translate("Position")}>
            {categories.map((b) => (
              <Chip
                key={b}
                active={facets.categories.includes(b)}
                onClick={() => onChange({ ...facets, categories: toggle(facets.categories, b) })}
              >
                {translate(CATEGORY_LABEL[b])}
              </Chip>
            ))}
          </Group>
        )}
        {eras.length > 0 && (
          <Group title={translate("Era")}>
            {eras.map((b) => (
              <Chip
                key={b}
                active={facets.eras.includes(b)}
                onClick={() => onChange({ ...facets, eras: toggle(facets.eras, b) })}
              >
                {translate(ERA_LABEL[b])}
              </Chip>
            ))}
          </Group>
        )}
        <Group title={translate("Min rating")}>
          <Chip active={facets.minStars === 0} onClick={() => onChange({ ...facets, minStars: 0 })}>
            {translate("Any")}
          </Chip>
          {RATING_OPTIONS.map((n) => (
            <Chip key={n} active={facets.minStars === n} onClick={() => onChange({ ...facets, minStars: n })}>
              {n}★+
            </Chip>
          ))}
        </Group>
        {perfFlags.length > 0 && (
          <Group title={translate("Performance")}>
            {perfFlags.map((f) => (
              <Chip
                key={f}
                active={facets.perf.includes(f)}
                onClick={() => onChange({ ...facets, perf: toggle(facets.perf, f) })}
              >
                {translate(PERF_LABEL[f])}
              </Chip>
            ))}
          </Group>
        )}
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={() => onChange(EMPTY_FACETS)}
          className="text-[0.72rem] soft-text underline-offset-2 transition hover:text-[rgb(var(--text))] hover:underline"
        >
          {translate("Reset filters")}
        </button>
      </div>
    </div>
  );
}
