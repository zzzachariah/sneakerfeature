"use client";

import { useEffect, useRef, useState } from "react";
import { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { pickLocalized } from "@/components/i18n/localized-field";
import { SPEC_ROWS } from "@/components/compare/compare-metrics";

const EMPTY_LABEL = "—";

type Props = {
  shoes: Shoe[];
  active?: boolean;
};

export function CompareSpecTable({ shoes, active = true }: Props) {
  const { translate, locale } = useLocale();
  const pulsedRef = useRef(false);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!active || pulsedRef.current) return;
    pulsedRef.current = true;
    setPulse(true);
    const t = setTimeout(() => setPulse(false), 1500);
    return () => clearTimeout(t);
  }, [active]);

  if (!shoes.length) return null;

  const rows = SPEC_ROWS.map((row) => {
    // Pick the stored Chinese translation (fallback English) per locale — the
    // spec values are pre-translated in Supabase, no render-time MT.
    const values = shoes.map((shoe) => pickLocalized(locale, row.get(shoe), row.getZh(shoe)));
    const distinct = new Set(values.map((v) => (v ?? "").trim().toLowerCase()));
    return { key: row.key, label: row.label, values, differs: distinct.size > 1 };
  });

  return (
    <div className="overflow-hidden rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.3)] bg-[rgb(var(--bg-elev)/0.45)]">
      {shoes.length === 2 ? (
        <PairedLayout rows={rows} shoes={shoes} translate={translate} pulse={pulse} />
      ) : (
        <ColumnLayout rows={rows} shoes={shoes} translate={translate} pulse={pulse} />
      )}
    </div>
  );
}

function PairedLayout({
  rows,
  shoes,
  translate,
  pulse
}: {
  rows: Array<{ key: string; label: string; values: Array<string | null>; differs: boolean }>;
  shoes: Shoe[];
  translate: (value: string) => string;
  pulse: boolean;
}) {
  return (
    <div>
      {/* Mobile header (<md) — single row with both shoe names */}
      <div className="grid grid-cols-2 gap-3 border-b border-[rgb(var(--muted)/0.18)] bg-[rgb(var(--surface)/0.4)] px-4 py-3 md:hidden">
        <span className="truncate text-[0.7rem] font-semibold text-[rgb(var(--text)/0.85)]">{shoes[0].shoe_name}</span>
        <span className="truncate text-right text-[0.7rem] font-semibold text-[rgb(var(--text)/0.85)]">
          {shoes[1].shoe_name}
        </span>
      </div>
      {/* Desktop header (md+) */}
      <div className="hidden grid-cols-3 gap-4 border-b border-[rgb(var(--muted)/0.18)] bg-[rgb(var(--surface)/0.4)] px-6 py-3 md:grid">
        <span className="text-[0.7rem] font-semibold text-[rgb(var(--text)/0.85)]">{shoes[0].shoe_name}</span>
        <span className="t-eyebrow text-center">{translate("Spec")}</span>
        <span className="text-right text-[0.7rem] font-semibold text-[rgb(var(--text)/0.85)]">
          {shoes[1].shoe_name}
        </span>
      </div>
      {rows.map((row, i) => (
        <div
          key={row.key}
          className={`${i < rows.length - 1 ? "border-b border-[rgb(var(--muted)/0.14)]" : ""} ${
            row.differs ? "border-l-2 border-l-[rgb(var(--text)/0.35)] bg-[rgb(var(--text)/0.02)]" : ""
          } ${pulse && row.differs ? "accent-pulse" : ""}`}
        >
          {/* Mobile stacked layout (<md) */}
          <div className="flex flex-col gap-2 px-4 py-3 md:hidden">
            <span className="text-[0.6rem] uppercase tracking-[0.16em] text-[rgb(var(--subtext)/0.85)]">
              {translate(row.label)}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <SpecValue value={row.values[0]} align="left" />
              <SpecValue value={row.values[1]} align="right" />
            </div>
          </div>
          {/* Desktop paired layout (md+) */}
          <div className="hidden grid-cols-3 items-center gap-4 px-6 py-3 md:grid">
            <SpecValue value={row.values[0]} align="left" />
            <span className="text-center text-[0.62rem] uppercase tracking-[0.12em] text-[rgb(var(--subtext)/0.8)]">
              {translate(row.label)}
            </span>
            <SpecValue value={row.values[1]} align="right" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ColumnLayout({
  rows,
  shoes,
  translate,
  pulse
}: {
  rows: Array<{ key: string; label: string; values: Array<string | null>; differs: boolean }>;
  shoes: Shoe[];
  translate: (value: string) => string;
  pulse: boolean;
}) {
  const cols = `minmax(140px,1fr) repeat(${shoes.length}, minmax(140px,1fr))`;
  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 140 * (shoes.length + 1) }}>
        <div
          className="grid gap-4 border-b border-[rgb(var(--muted)/0.18)] bg-[rgb(var(--surface)/0.4)] px-6 py-3"
          style={{ gridTemplateColumns: cols }}
        >
          <span className="t-eyebrow">{translate("Spec")}</span>
          {shoes.map((shoe) => (
            <span key={shoe.id} className="text-[0.7rem] font-semibold text-[rgb(var(--text)/0.85)]">
              {shoe.shoe_name}
            </span>
          ))}
        </div>
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={`grid items-center gap-4 px-6 py-3 ${
              i < rows.length - 1 ? "border-b border-[rgb(var(--muted)/0.14)]" : ""
            } ${row.differs ? "border-l-2 border-l-[rgb(var(--text)/0.35)] bg-[rgb(var(--text)/0.02)]" : ""} ${
              pulse && row.differs ? "accent-pulse" : ""
            }`}
            style={{ gridTemplateColumns: cols }}
          >
            <span className="text-[0.62rem] uppercase tracking-[0.12em] text-[rgb(var(--subtext)/0.8)]">
              {translate(row.label)}
            </span>
            {row.values.map((value, vi) => (
              <SpecValue key={`${row.key}-${vi}`} value={value} align="left" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function SpecValue({ value, align }: { value: string | null; align: "left" | "right" }) {
  const alignClass = align === "right" ? "text-right" : "text-left";
  if (!value) {
    return <span className={`text-[0.8rem] soft-text ${alignClass}`}>{EMPTY_LABEL}</span>;
  }
  // Values are already localized (pre-translated zh / English fallback).
  return <span className={`text-[0.8rem] text-[rgb(var(--text)/0.85)] ${alignClass}`}>{value}</span>;
}
