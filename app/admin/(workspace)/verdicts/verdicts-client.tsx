"use client";

import { useRef, useState } from "react";
import { Scale, Upload, CheckCircle2, AlertTriangle, Ban } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { parseVerdictCsv } from "@/lib/admin/verdict-csv";
import { cn } from "@/lib/utils";

const SAMPLE_HEADER = "slug,brand,shoe_name,pro_summary,pro_summary_zh,con_summary,con_summary_zh";

// Rows are POSTed in small batches so the bar can advance after each one (and so
// a large file never rides on a single long serverless request).
const BATCH_SIZE = 50;

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
  errors?: string[];
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
  const [errors, setErrors] = useState<string[]>([]);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState("");

  // Guards a double-click / concurrent submit; and a flag the loop checks to stop.
  const submittingRef = useRef(false);
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const importing = phase === "importing";
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const noMatches = phase === "done" && !error && total > 0 && tally.matched === 0;
  const warn = noMatches || cancelled;

  function resetProgress() {
    setPhase("idle");
    setTotal(0);
    setProcessed(0);
    setTally(ZERO_TALLY);
    setUnmatched([]);
    setErrors([]);
    setCancelled(false);
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
    if (submittingRef.current) return; // ignore concurrent / double-click submits
    const parsed = parseVerdictCsv(csv);
    if (!parsed.ok) {
      resetProgress();
      setError(parsed.error);
      return;
    }
    const rows = parsed.rows;

    submittingRef.current = true;
    cancelRef.current = false;
    setError("");
    setCancelled(false);
    setTally(ZERO_TALLY);
    setUnmatched([]);
    setErrors([]);
    setTotal(rows.length);
    setProcessed(0);
    setPhase("importing");

    const acc: Tally = { ...ZERO_TALLY };
    const accUnmatched: string[] = [];
    const accErrors: string[] = [];

    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        if (cancelRef.current) {
          setCancelled(true);
          break;
        }
        const batch = rows.slice(i, i + BATCH_SIZE);
        const isFinal = i + BATCH_SIZE >= rows.length;
        const res = await fetch("/api/admin/verdicts/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: batch, mode, final: isFinal })
        });
        const data: BatchResponse = await res.json();
        if (!data.ok) {
          setError(data.message ?? "Import failed.");
          break;
        }

        acc.matched += data.matched ?? 0;
        acc.updated += data.updated ?? 0;
        acc.inserted += data.inserted ?? 0;
        acc.skippedNoData += data.skippedNoData ?? 0;
        if (data.unmatched?.length) accUnmatched.push(...data.unmatched);
        if (data.errors?.length) accErrors.push(...data.errors);

        setTally({ ...acc });
        setUnmatched([...accUnmatched]);
        setErrors([...accErrors]);
        setProcessed(Math.min(i + batch.length, rows.length));
      }
    } catch {
      setError("Network error. Some rows may not have been imported.");
    } finally {
      submittingRef.current = false;
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

  const doneLabel = importing
    ? "Importing…"
    : cancelled
      ? "Import cancelled"
      : error
        ? "Finished with errors"
        : noMatches
          ? "No rows matched any shoe"
          : "Import complete";

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Verdict import"
        description="Bulk-load each shoe's one-line pro / con verdict from a CSV. Rows are matched to shoes by slug (or brand + shoe_name). Blank cells never overwrite existing text."
        icon={Scale}
      />

      <div className="surface-card premium-border space-y-4 rounded-2xl p-4 sm:p-5">
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
              "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[rgb(var(--accent)/0.5)] px-4 text-sm text-[rgb(var(--accent))] transition md:min-h-0 md:px-3 md:py-1.5",
              importing ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-[rgb(var(--accent)/0.1)] active:bg-[rgb(var(--accent)/0.1)]"
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

        {/* Mobile: mode picker stacks above a full-width button row so nothing
            wraps into an ambiguous cluster at 375px. sm+: original inline bar. */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
          <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" disabled={importing}>
            <legend className="t-eyebrow mr-1 inline">On conflict</legend>
            <label className="inline-flex min-h-[44px] items-center gap-2 sm:min-h-0 sm:gap-1.5">
              <input type="radio" name="mode" checked={mode === "overwrite"} onChange={() => setMode("overwrite")} />
              Overwrite
            </label>
            <label className="inline-flex min-h-[44px] items-center gap-2 sm:min-h-0 sm:gap-1.5">
              <input type="radio" name="mode" checked={mode === "fill"} onChange={() => setMode("fill")} />
              Only fill empty
            </label>
          </fieldset>

          <div className="flex gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={reset}
              disabled={importing}
              className="min-h-[44px] flex-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 text-sm transition hover:bg-[rgb(var(--muted)/0.3)] active:bg-[rgb(var(--muted)/0.3)] disabled:opacity-50 sm:flex-none md:min-h-0 md:py-1.5"
            >
              Reset
            </button>
            {importing ? (
              <button
                type="button"
                onClick={() => {
                  cancelRef.current = true;
                }}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-400/60 px-3 text-sm font-medium text-rose-300 transition hover:bg-rose-400/10 active:bg-rose-400/10 sm:flex-none md:min-h-0 md:py-1.5"
              >
                <Ban className="h-4 w-4" />
                Cancel
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={!csv.trim()}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.12)] px-3 text-sm font-medium text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.2)] active:bg-[rgb(var(--accent)/0.2)] disabled:opacity-50 sm:flex-none md:min-h-0 md:py-1.5"
              >
                <Upload className="h-4 w-4" />
                Import
              </button>
            )}
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
        <div className="surface-card premium-border space-y-4 rounded-2xl p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-[rgb(var(--text))]">{doneLabel}</span>
            <span className="num-display soft-text">
              {pct}% · {processed}/{total}
            </span>
          </div>

          {/* Live progress bar — eased fill, accent glow, breathing while in flight.
              A small minimum width keeps it visible the instant an import starts. */}
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
              style={{ width: `${importing ? Math.max(pct, 5) : pct}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Matched" value={tally.matched} />
            <Stat label="Updated" value={tally.updated} />
            <Stat label="Created" value={tally.inserted} />
            <Stat label="Unmatched" value={unmatched.length} />
          </div>

          {phase === "done" && !error && (
            <div className={cn("flex items-center gap-2", warn ? "text-amber-300" : "text-emerald-400")}>
              {warn ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
              <p className="font-medium">
                {cancelled ? "Cancelled — " : ""}
                {tally.matched} matched: {tally.updated} updated, {tally.inserted} created, {tally.skippedNoData} skipped
                (no text), {unmatched.length} unmatched
                {errors.length ? `, ${errors.length} errored` : ""}.
              </p>
            </div>
          )}

          {noMatches && (
            <p className="text-sm soft-text">
              No rows matched a shoe — check that your <code>slug</code> (or <code>brand</code> + <code>shoe_name</code>)
              matches existing shoes.
            </p>
          )}

          {errors.length > 0 && (
            <div className="rounded-xl border border-rose-400/40 bg-rose-400/10 p-3 text-sm">
              <p className="font-medium text-rose-300">Write errors:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-rose-200/90">
                {errors.slice(0, 50).map((u, i) => (
                  <li key={`${u}-${i}`} className="break-all">
                    {u}
                  </li>
                ))}
                {errors.length > 50 && <li className="list-none soft-text">…and {errors.length - 50} more</li>}
              </ul>
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
