"use client";

import { useRef, useState } from "react";
import { Scale, Upload, CheckCircle2, AlertTriangle } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

type ImportReport = {
  ok: boolean;
  message: string;
  matched?: number;
  updated?: number;
  inserted?: number;
  skippedNoData?: number;
  unmatched?: string[];
};

const SAMPLE_HEADER = "slug,brand,shoe_name,pro_summary,pro_summary_zh,con_summary,con_summary_zh";

export function VerdictsImportClient() {
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [mode, setMode] = useState<"overwrite" | "fill">("overwrite");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setReport(null);
    setError("");
    setCsv(await file.text());
  }

  async function submit() {
    if (!csv.trim()) {
      setError("Paste CSV text or choose a .csv file first.");
      return;
    }
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const res = await fetch("/api/admin/verdicts/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, mode })
      });
      const data: ImportReport = await res.json();
      if (data.ok) {
        setReport(data);
      } else {
        setError(data.message ?? "Import failed.");
      }
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setCsv("");
    setFileName(null);
    setReport(null);
    setError("");
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
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[rgb(var(--accent)/0.5)] px-3 py-1.5 text-sm text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.1)]">
            <Upload className="h-4 w-4" />
            Choose .csv file
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onPickFile} />
          </label>
          {fileName && <span className="text-xs soft-text">{fileName}</span>}
        </div>

        <div>
          <label className="t-eyebrow mb-1 block">CSV content</label>
          <textarea
            value={csv}
            onChange={(e) => {
              setCsv(e.target.value);
              setReport(null);
            }}
            rows={10}
            spellCheck={false}
            placeholder={`${SAMPLE_HEADER}\ngt-cut-3,Nike,GT Cut 3,...`}
            className="w-full rounded-xl border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.5)] p-3 font-mono text-xs leading-5 text-[rgb(var(--text))] outline-none focus:border-[rgb(var(--accent)/0.6)]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <fieldset className="flex items-center gap-3 text-sm">
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
              disabled={busy}
              className="rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 py-1.5 text-sm transition hover:bg-[rgb(var(--muted)/0.3)] disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={busy || !csv.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.12)] px-3 py-1.5 text-sm font-medium text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.2)] disabled:opacity-50"
            >
              <Upload className="h-4 w-4" />
              {busy ? "Importing…" : "Import"}
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

      {report?.ok && (
        <div className="surface-card premium-border space-y-3 rounded-2xl p-5">
          <div className="flex items-center gap-2 text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            <p className="font-medium">{report.message}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Stat label="Matched" value={report.matched ?? 0} />
            <Stat label="Updated" value={report.updated ?? 0} />
            <Stat label="Created" value={report.inserted ?? 0} />
            <Stat label="Unmatched" value={report.unmatched?.length ?? 0} />
          </div>
          {report.unmatched && report.unmatched.length > 0 && (
            <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 p-3 text-sm">
              <p className="font-medium text-amber-300">Not matched to any shoe (skipped):</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-amber-200/90">
                {report.unmatched.map((u, i) => (
                  <li key={`${u}-${i}`} className="break-all">
                    {u}
                  </li>
                ))}
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
      <p className="text-lg font-semibold text-[rgb(var(--text))]">{value}</p>
      <p className="text-xs soft-text">{label}</p>
    </div>
  );
}
