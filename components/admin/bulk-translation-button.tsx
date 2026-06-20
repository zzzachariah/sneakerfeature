"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { useLocale } from "@/components/i18n/locale-provider";

type Stats = { totalShoes: number; pendingShoes: number };

// Parse a JSON API response, but if the body isn't JSON (an HTML 404/500 page,
// a login redirect, an empty body…) surface the HTTP status + a short snippet
// instead of a cryptic "JSON.parse: unexpected character" from res.json(). A 404
// here almost always means the deployment handling the request isn't running the
// latest code (the translation routes don't exist yet).
async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 140);
    const reason =
      res.status === 404
        ? "endpoint not found — is this deployment running the latest code?"
        : snippet || "non-JSON response";
    throw new Error(`HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ""} — ${reason}`);
  }
}

type TickResponse = {
  ok: boolean;
  done?: boolean;
  processedShoeId?: string | null;
  label?: string | null;
  success?: boolean;
  detail?: string | null;
  remaining?: number;
  stats?: Stats;
  error?: string;
};

// Drives the per-shoe translation loop against /api/admin/translations/tick.
// Mirrors BulkImageImportButton's UX (progress + stop) but needs no job table:
// "pending" is derived from the *_zh columns, so re-clicking just resumes.
export function BulkTranslationButton() {
  const { translate } = useLocale();
  const [stats, setStats] = useState<Stats>({ totalShoes: 0, pendingShoes: 0 });
  const [running, setRunning] = useState(false);
  const [processed, setProcessed] = useState(0);
  const [succeeded, setSucceeded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [forceRetranslate, setForceRetranslate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const stopRef = useRef(false);
  const runningRef = useRef(false);
  const isMountedRef = useRef(true);

  const loadStatus = useCallback(async () => {
    const res = await fetch("/api/admin/translations", { method: "GET", cache: "no-store" });
    const json = await readJson<{ ok?: boolean; stats?: Stats; error?: string }>(res);
    if (!res.ok || !json?.ok) throw new Error(json?.error ?? `Failed to load translation status (HTTP ${res.status})`);
    if (isMountedRef.current && json.stats) setStats(json.stats);
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadStatus().catch(() => {
      /* best effort */
    });
    const interval = setInterval(() => {
      if (!runningRef.current) loadStatus().catch(() => {});
    }, 3500);
    return () => {
      isMountedRef.current = false;
      clearInterval(interval);
    };
  }, [loadStatus]);

  const runLoop = useCallback(
    async (force: boolean) => {
      if (runningRef.current) return;
      runningRef.current = true;
      stopRef.current = false;
      setRunning(true);
      setError(null);
      setMessage(null);
      setProcessed(0);
      setSucceeded(0);
      setFailed(0);
      setRemaining(null);
      setCurrentLabel(null);

      const exclude: string[] = [];
      let localSucceeded = 0;
      let localFailed = 0;

      try {
        while (!stopRef.current) {
          const res = await fetch("/api/admin/translations/tick", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ excludeIds: exclude, force })
          });
          const json = await readJson<TickResponse>(res);
          if (!res.ok || !json.ok) throw new Error(json.error ?? json.detail ?? `Translation failed (HTTP ${res.status})`);
          if (json.stats && isMountedRef.current) setStats(json.stats);

          if (json.done || !json.processedShoeId) {
            if (isMountedRef.current) {
              setRemaining(0);
              setCurrentLabel(null);
            }
            break;
          }

          exclude.push(json.processedShoeId);
          if (json.success) localSucceeded += 1;
          else localFailed += 1;

          if (isMountedRef.current) {
            setProcessed(exclude.length);
            setSucceeded(localSucceeded);
            setFailed(localFailed);
            setRemaining(typeof json.remaining === "number" ? json.remaining : null);
            setCurrentLabel(json.label ?? null);
          }
        }

        if (isMountedRef.current) {
          setMessage(
            stopRef.current
              ? translate(`Stopped. Translated ${localSucceeded} shoe(s) this run.`)
              : translate(`Done. Translated ${localSucceeded} shoe(s), ${localFailed} failed.`)
          );
        }
        await loadStatus().catch(() => {});
      } catch (err) {
        if (isMountedRef.current) setError(err instanceof Error ? err.message : "Translation failed");
      } finally {
        runningRef.current = false;
        if (isMountedRef.current) setRunning(false);
      }
    },
    [loadStatus, translate]
  );

  const total = processed + (remaining ?? 0);
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;
  const nothingToDo = !forceRetranslate && stats.pendingShoes === 0;

  return (
    <div className="space-y-3 rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.55)] p-4">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p>
          <span className="soft-text">{translate("Untranslated shoes")}: </span>
          <span className="num-display font-semibold">{stats.pendingShoes}</span>
        </p>
        <p>
          <span className="soft-text">{translate("Total shoes")}: </span>
          <span className="num-display font-semibold">{stats.totalShoes}</span>
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={forceRetranslate}
          disabled={running}
          onChange={(event) => setForceRetranslate(event.target.checked)}
        />
        <span>{translate("Re-translate all (overwrite existing Chinese)")}</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => runLoop(forceRetranslate)} disabled={running || nothingToDo}>
          {running
            ? translate("Translating...")
            : forceRetranslate
              ? translate("Re-translate all shoes")
              : translate("Translate all missing")}
        </Button>
        {running && (
          <Button type="button" variant="secondary" onClick={() => (stopRef.current = true)}>
            {translate("Stop")}
          </Button>
        )}
      </div>

      {message && <FeedbackMessage message={message} />}
      {error && <FeedbackMessage message={error} isError />}

      {(running || processed > 0) && (
        <div className="space-y-2 text-sm">
          <p>
            {translate("Progress")}: <span className="num-display">{processed} / {total}</span>
          </p>
          <div className="h-2 w-full rounded-full bg-[rgb(var(--muted)/0.35)]">
            <div className="h-2 rounded-full bg-[rgb(var(--accent))]" style={{ width: `${percent}%` }} />
          </div>
          <p>
            {translate("Translated")}: <span className="num-display">{succeeded}</span>
          </p>
          <p>
            {translate("Failed")}: <span className="num-display">{failed}</span>
          </p>
          {currentLabel ? (
            <p>
              {translate("Current shoe")}: {currentLabel}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
