"use client";

import { useRef, useState } from "react";
import { Scale, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { parseVerdictCsv } from "@/lib/admin/verdict-csv";
import { cn } from "@/lib/utils";

const SAMPLE_HEADER = "slug,brand,shoe_name,pro_summary,pro_summary_zh,con_summary,con_summary_zh";

// Rows are POSTed in small batches so the bar can advance after each one (and so
// a large file never rides on a single long serverless request).
const BATCH_SIZE = 25;

type Tally = { matched: number; updated: number; inserted: number; skippedNoData: number };
const ZERO_TALLY: Tally = { matched: 0, updated: 0, inserted: 0, skippedNoData: 0 };

type BatchResponse = {
  ok: boolean;
  message?: string;
  matched?: number;
  updated?: number;
  inserted?: number;
  skippedNoData?: number;
  unmatched?: string[];
};

export function VerdictsImportClient() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<"overwrite" | "fill">("overwrite");

  const [phase, setPhase] = useState<"idle" | "importing" | "done">("idle");
  const [total, setTotal] = useState(0);
  const [processed, setProcessed] = useState(0);
  const [tally, setTally] = useState<Tally>(ZERO_TALLY);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [error, setError] = useState("");

  const fileRef = useRef<HTMLInputElement>(null);

  const importing = phase === "importing";
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;

  function resetProgress() {
    setPhase("idle");
    setTotal(0);
    setProcessed(0);
    setTally(ZERO_TALLY);
    setUnmatched([]);
    setError("");
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    resetProgress();
    setCsv(await file.text());
  }

  async function submit() {
    const parsed = parseVerdictCsv(csv);
    if (!parsed.ok) {
      resetProgress();
      setError(parsed.error);
      return;
    }
    const rows = parsed.rows;

    setError("");
    setTally(ZERO_TALLY);
    setUnmatched([]);
    setTotal(rows.length);
    setProcessed(0);
    setPhase("importing");

    const acc: Tally = { ...ZERO_TALLY };
    const accUnmatched: string[] = [];

    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const res = await fetch("/api/admin/verdicts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch, mode })
        });
        const data: BatchResponse = await res.json();
        if (!data.ok) {
          setError(data.message ?? "Import failed.");
          setPhase("done");
          return;
        }

        acc.matched += data.matched ?? 0;
        acc.updated += data.updated ?? 0;
        acc.inserted += data.inserted ?? 0;
        acc.skippedNoData += data.skippedNoData ?? 0;
        if (data.unmatched?.length) accUnmatched.push(...data.unmatched);

        setTally({ ...acc });
        setUnmatched([...accUnmatched]);
        setProcessed(Math.min(i + batch.length, rows.length));
      }
      setPhase("done");
    } catch {
      setError("Network error. Some rows may not have been imported.");
      setPhase("done");
    }
  }

  function reset() {
    setCsv("");
    setFileName(null);
    setMode("overwrite");
    resetProgress();
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Verdict import"
        description="Bulk-load each shoe's one-line pro / con verdict from a CSV. Rows are matched to shoes by slug (or brand + shoe_name). Blank cells never overwrite existing text."
        icon={Scale}
      />

      <div className="surface-card premium-border space-y-4 rounded-2xl p-5">
        <div className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-3 text-sm leading-6 soft-text">
          <p className="font-medium text-[rgb(var(--text))]">Expected columns (header row required)</p>
          <code className="mt-1 block break-all text-xs text-[rgb(var(--accent))]">{SAMPLE_HEADER}</code>
          <p className="mt-2">
            A <code>slug</code> column is the most reliable match key; <code>brand</code> + <code>shoe_name</code> work
            as a fallback. The four verdict columns are all optional — include only what you have. Chinese goes in the
            <code> *_zh</code> columns, English in the plain columns.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border border-[rgb(var(--accent)/0.5)] px-3 py-1.5 text-sm text-[rgb(var(--accent))] transition",
              importing ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[rgb(var(--accent)/0.1)]"
            )}
          >
            <Upload className="h-4 w-4" />
            Choose .csv file
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              disabled={importing}
              className="hidden"
              onChange={onPickFile}
            />
          </label>
          {fileName && <span className="text-xs soft-text">{fileName}</span>}
        </div>

        <div>
          <label className="t-eyebrow mb-1 block">CSV content</label>
          <textarea
            value={csv}
            disabled={importing}
            onChange={(e) => {
              setCsv(e.target.value);
              resetProgress();
            }}
            rows={10}
            spellCheck={false}
            placeholder={`${SAMPLE_HEADER}\ngt-cut-3,Nike,GT Cut 3,...`}
            className="w-full rounded-xl border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.5)] p-3 font-mono text-xs leading-5 text-[rgb(var(--text))] outline-none focus:border-[rgb(var(--accent)/0.6)] disabled:opacity-60"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <fieldset className="flex items-center gap-3 text-sm" disabled={importing}>
            <legend className="t-eyebrow mr-1 inline">On conflict</legend>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === "overwrite"} onChange={() => setMode("overwrite")} />
              Overwrite
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input type="radio" name="mode" checked={mode === "fill"} onChange={() => setMode("fill")} />
              Only fill empty
            </label>
          </fieldset>

          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={reset}
              disabled={importing}
              className="rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 py-1.5 text-sm transition hover:bg-[rgb(var(--muted)/0.3)] disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={importing || !csv.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.12)] px-3 py-1.5 text-sm font-medium text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.2)] disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {importing ? `Importing… ${pct}%` : "Import"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-rose-400/50 bg-rose-400/10 p-4 text-sm text-rose-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {phase !== "idle" && (
        <div className="surface-card premium-border space-y-4 rounded-2xl p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[rgb(var(--text))]">
              {importing ? "Importing…" : error ? "Finished with errors" : "Import complete"}
            </span>
            <span className="num-display soft-text">
              {pct}% · {processed}/{total}
            </span>
          </div>

          {/* Live progress bar — eased fill, accent glow, breathing while in flight. */}
          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-[rgb(var(--muted)/0.35)]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn(
                "h-full rounded-full bg-gradient-to-r from-[rgb(var(--accent)/0.7)] to-[rgb(var(--accent))] shadow-[0_0_12px_rgb(var(--accent)/0.45)] transition-[width] duration-500 ease-out",
                importing && "animate-pulse"
              )}
              style={{ width: `${Math.max(pct, processed > 0 ? 4 : 0)}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Matched" value={tally.matched} />
            <Stat label="Updated" value={tally.updated} />
            <Stat label="Created" value={tally.inserted} />
            <Stat label="Unmatched" value={unmatched.length} />
          </div>

          {phase === "done" && !error && (
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <p className="font-medium">
                Imported {tally.matched} shoe(s): {tally.updated} updated, {tally.inserted} created,{" "}
                {tally.skippedNoData} skipped (no verdict text), {unmatched.length} unmatched.
              </p>
            </div>
          )}

          {phase === "done" && unmatched.length > 0 && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
              <p className="font-medium text-amber-300">Not matched to any shoe (skipped):</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200/90">
                {unmatched.slice(0, 100).map((u, i) => (
                  <li key={`${u}-${i}`} className="break-all">
                    {u}
                  </li>
                ))}
                {unmatched.length > 100 && <li className="list-none soft-text">…and {unmatched.length - 100} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-3 text-center">
      <p className="num-display text-lg font-semibold text-[rgb(var(--text))]">{value}</p>
      <p className="text-xs soft-text">{label}</p>
    </div>
  );
}
