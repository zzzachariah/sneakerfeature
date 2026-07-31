"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Shared controls for the outreach console. Everything here follows the admin
// styling already in the app (surface tokens, 2xl radius, hairline borders)
// rather than introducing a second visual language.
//
// Colour comes from CSS variables, never Tailwind's palette: `npm run
// lint:tokens` fails on a literal red/green utility class, and the semantic
// tokens are what keep light and dark themes honest.

export const INPUT_CLASS =
  "w-full min-w-0 rounded-lg border border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev))] px-2.5 py-2 text-sm " +
  "transition focus:border-[rgb(var(--accent)/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.15)] " +
  "disabled:opacity-40";

/** Section wrapper — a labelled card, the same shape as every other admin panel. */
export function Section({
  title,
  count,
  description,
  children,
  id
}: {
  title: string;
  count?: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="surface-card premium-border rounded-2xl p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold tracking-[-0.01em]">{title}</h2>
        {count && (
          <span className="rounded-full bg-[rgb(var(--muted)/0.45)] px-2 py-0.5 text-[0.7rem] font-medium tabular-nums">
            {count}
          </span>
        )}
        {description && <p className="w-full text-xs soft-text sm:w-auto">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** The three score inputs as pips — 5 dots, N filled. Shown next to the
 *  composite because eleven composites spanning 3.70–4.70 hide which axis is
 *  actually weak: 5/1/4 and 4/3/4 are nearly the same number and completely
 *  different problems. */
export function PipRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[4.5rem] shrink-0 text-[0.65rem] uppercase tracking-[0.08em] soft-text">
        {label}
      </span>
      <span className="flex gap-1" role="img" aria-label={`${label}: ${value} of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <span
            key={n}
            aria-hidden
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              n <= value ? "bg-[rgb(var(--accent))]" : "bg-[rgb(var(--muted))]"
            )}
          />
        ))}
      </span>
      <span className="text-[0.7rem] tabular-nums soft-text">{value}</span>
    </div>
  );
}

/** A number field that only commits on blur / Enter, so typing "12" doesn't
 *  fire a request for "1". Stats are typed in by hand from Stripe. */
export function StatInput({
  label,
  value,
  step = 1,
  prefix,
  disabled,
  onCommit
}: {
  label: string;
  value: number;
  step?: number;
  prefix?: string;
  disabled?: boolean;
  onCommit: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const dirty = useRef(false);

  // Follow the server value unless the operator is mid-edit.
  useEffect(() => {
    if (!dirty.current) setDraft(String(value));
  }, [value]);

  function commit() {
    dirty.current = false;
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 0) {
      setDraft(String(value));
      return;
    }
    const rounded = step === 1 ? Math.round(next) : Math.round(next * 100) / 100;
    if (rounded === value) {
      setDraft(String(value));
      return;
    }
    onCommit(rounded);
  }

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">{label}</span>
      <span className="relative flex items-center">
        {prefix && (
          <span className="pointer-events-none absolute left-2.5 text-xs soft-text">{prefix}</span>
        )}
        <input
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          disabled={disabled}
          value={draft}
          onChange={(e) => {
            dirty.current = true;
            setDraft(e.target.value);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          className={cn(INPUT_CLASS, "tabular-nums", prefix && "pl-6")}
        />
      </span>
    </label>
  );
}

/** Text / date / textarea field that commits on blur. */
export function InlineField({
  label,
  value,
  type = "text",
  rows,
  placeholder,
  disabled,
  onCommit
}: {
  label: string;
  value: string | null;
  type?: "text" | "date";
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
  onCommit: (next: string | null) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const dirty = useRef(false);

  useEffect(() => {
    if (!dirty.current) setDraft(value ?? "");
  }, [value]);

  function commit() {
    dirty.current = false;
    const next = draft.trim() === "" ? null : draft;
    if (next === value) return;
    onCommit(next);
  }

  const shared = {
    disabled,
    placeholder,
    value: draft,
    onBlur: commit,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      dirty.current = true;
      setDraft(e.target.value);
    }
  };

  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">{label}</span>
      {rows ? (
        <textarea {...shared} rows={rows} className={cn(INPUT_CLASS, "resize-y leading-relaxed")} />
      ) : (
        <input
          {...shared}
          type={type}
          onKeyDown={(e) => {
            if (e.key === "Enter" && type !== "text") e.currentTarget.blur();
          }}
          className={cn(INPUT_CLASS, type === "date" && "tabular-nums")}
        />
      )}
    </label>
  );
}

/** Small tonal chip. `tone` maps to a semantic token, never a palette colour. */
export function Chip({
  tone = "neutral",
  children,
  className
}: {
  tone?: "neutral" | "error" | "warn" | "success" | "accent";
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-[rgb(var(--muted)/0.45)] text-[rgb(var(--text)/0.75)]",
    error: "bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))] border border-[rgb(var(--error)/0.35)]",
    warn: "bg-[rgb(var(--gold-line)/0.16)] text-[rgb(var(--gold-ink))] border border-[rgb(var(--gold-line)/0.4)]",
    success:
      "bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))] border border-[rgb(var(--success)/0.35)]",
    accent: "bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]"
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.08em]",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Monospace code / date treatment for ref codes and dates. */
export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[0.7rem] tabular-nums soft-text", className)}>{children}</span>
  );
}

export function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Hostname for a source link's label. Falls back to the raw string rather
 *  than throwing — a malformed URL in the data should not blank the card. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function elapsedLabel(days: number | null): string {
  if (days === null) return "—";
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}
