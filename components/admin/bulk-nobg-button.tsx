"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { useLocale } from "@/components/i18n/locale-provider";
import { Input } from "@/components/ui/input";

type NobgStats = {
  totalShoes: number;
  withApprovedImage: number;
  remaining: number;
};

type NobgJob = {
  id: string;
  status: "running" | "cancel_requested" | "cancelled" | "completed" | "failed";
  total_count: number;
  processed_count: number;
  success_count: number;
  skip_count: number;
  failure_count: number;
  current_shoe_label?: string | null;
  started_at: string;
  updated_at: string;
  completed_at?: string | null;
};

type NobgJobItem = {
  shoe_id: string;
  shoe_label: string;
  status: "failed" | "skipped";
  error_message?: string | null;
};

type SelectableShoe = {
  id: string;
  label: string;
  brand: string;
  shoe_name: string;
  release_year?: number | null;
};

type ClaimedItem = {
  itemId: string;
  shoeId: string;
  shoeLabel: string;
  sourcePublicUrl: string;
  sourceStoragePath: string;
};

type StatusPayload = {
  stats?: NobgStats;
  active_job?: NobgJob | null;
  latest_job?: NobgJob | null;
  latest_items?: NobgJobItem[];
  available_shoes?: SelectableShoe[];
  max_quantity?: number;
};

// Match the offline batch (scripts/remove-backgrounds.mts): a cut-out that keeps
// < 2% or > 98.5% of the pixels is treated as a bad cut (rembg/imgly ate the
// shoe, or removed nothing) and the original is kept instead of going live.
const MIN_COVERAGE = 0.02;
const MAX_COVERAGE = 0.985;
const OUTPUT_SIZE = 1000;
const MARGIN = Math.round(OUTPUT_SIZE * 0.06);

type CutResult =
  | { kind: "success"; blob: Blob }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; error: string };

function alphaCoverage(bmp: ImageBitmap): number {
  const scale = Math.min(200 / bmp.width, 200 / bmp.height, 1);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return 1;
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let opaque = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 1;
    if (data[i + 3] > 24) opaque += 1;
  }
  return total ? opaque / total : 0;
}

// Center the cut-out in a padded, transparent square so framing is uniform
// across the catalog — the browser equivalent of the offline batch's finalizePng.
async function frameToSquare(bmp: ImageBitmap): Promise<Blob> {
  const inner = OUTPUT_SIZE - MARGIN * 2;
  const scale = Math.min(inner / bmp.width, inner / bmp.height);
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable.");
  ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  ctx.drawImage(bmp, Math.round((OUTPUT_SIZE - w) / 2), Math.round((OUTPUT_SIZE - h) / 2), w, h);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Could not encode the cut-out PNG.");
  return blob;
}

export function BulkNobgButton() {
  const { translate } = useLocale();
  const [stats, setStats] = useState<NobgStats>({ totalShoes: 0, withApprovedImage: 0, remaining: 0 });
  const [activeJob, setActiveJob] = useState<NobgJob | null>(null);
  const [latestJob, setLatestJob] = useState<NobgJob | null>(null);
  const [latestItems, setLatestItems] = useState<NobgJobItem[]>([]);
  const [availableShoes, setAvailableShoes] = useState<SelectableShoe[]>([]);
  const [selectedShoeIds, setSelectedShoeIds] = useState<string[]>([]);
  const [shoeSearch, setShoeSearch] = useState("");
  const [quantityInput, setQuantityInput] = useState("20");
  const [maxQuantity, setMaxQuantity] = useState(200);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [workerStatus, setWorkerStatus] = useState<string | null>(null);
  const [workerHalted, setWorkerHalted] = useState(false);

  const isMountedRef = useRef(true);
  const loopRunningRef = useRef(false);
  const stopRef = useRef(false);
  const failStreakRef = useRef(0);

  const progressPercent = useMemo(() => {
    const total = activeJob?.total_count ?? latestJob?.total_count ?? 0;
    const processed = activeJob?.processed_count ?? latestJob?.processed_count ?? 0;
    if (!total) return 0;
    return Math.min(100, Math.round((processed / total) * 100));
  }, [activeJob, latestJob]);

  const applyJob = useCallback((job: NobgJob | null | undefined, nextStats?: NobgStats) => {
    if (nextStats) setStats(nextStats);
    if (job) setLatestJob(job);
    setActiveJob(job?.status === "running" || job?.status === "cancel_requested" ? job : null);
  }, []);

  const hydrateState = useCallback((payload: StatusPayload) => {
    setStats(payload.stats ?? { totalShoes: 0, withApprovedImage: 0, remaining: 0 });
    setActiveJob(payload.active_job ?? null);
    setLatestJob(payload.latest_job ?? null);
    setLatestItems(payload.latest_items ?? []);
    setAvailableShoes(payload.available_shoes ?? []);
    if (typeof payload.max_quantity === "number" && payload.max_quantity > 0) setMaxQuantity(payload.max_quantity);
  }, []);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/admin/shoes/images/bulk-nobg", { method: "GET", cache: "no-store" });
    const json = (await response.json()) as StatusPayload & { ok?: boolean; error?: string };
    if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load status");
    hydrateState(json);
  }, [hydrateState]);

  const isRunning = activeJob?.status === "running";
  const isStopping = activeJob?.status === "cancel_requested" || stopping;
  const isBusy = loading || isRunning || isStopping;

  const quantityError = useMemo(() => {
    if (selectedShoeIds.length > 0) return null;
    const trimmed = quantityInput.trim();
    if (!trimmed) return translate("Enter a quantity.");
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) return translate("Quantity must be a whole number greater than 0.");
    if (parsed > maxQuantity) return translate(`Quantity must be ${maxQuantity} or less.`);
    return null;
  }, [maxQuantity, quantityInput, selectedShoeIds.length, translate]);

  const filteredShoes = useMemo(() => {
    const query = shoeSearch.trim().toLowerCase();
    if (!query) return availableShoes;
    return availableShoes.filter((shoe) => shoe.label.toLowerCase().includes(query));
  }, [availableShoes, shoeSearch]);

  // Cut ONE shoe out in the browser: pull the current image through the
  // same-origin proxy (so the WASM worker isn't blocked by CORS), remove the
  // background with @imgly, QA the alpha coverage, then center it in a padded
  // square. Returns what the server should record for this item.
  const cutOut = useCallback(async (item: ClaimedItem): Promise<CutResult> => {
    let srcBlob: Blob;
    try {
      const proxied = `/api/image-proxy?url=${encodeURIComponent(item.sourcePublicUrl)}`;
      const srcRes = await fetch(proxied, { headers: { "x-sf-app": "1" }, cache: "no-store" });
      if (!srcRes.ok) return { kind: "failed", error: `Could not load the current image (${srcRes.status}).` };
      srcBlob = await srcRes.blob();
    } catch (err) {
      return { kind: "failed", error: err instanceof Error ? err.message : "Could not load the current image." };
    }

    let cutBlob: Blob;
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      cutBlob = await removeBackground(srcBlob);
    } catch (err) {
      return { kind: "failed", error: err instanceof Error ? err.message : "Background removal failed." };
    }

    try {
      const bmp = await createImageBitmap(cutBlob);
      const coverage = alphaCoverage(bmp);
      if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) {
        bmp.close?.();
        return { kind: "skipped", reason: `alpha coverage ${(coverage * 100).toFixed(1)}% out of range` };
      }
      const framed = await frameToSquare(bmp);
      bmp.close?.();
      return { kind: "success", blob: framed };
    } catch (err) {
      return { kind: "failed", error: err instanceof Error ? err.message : "Could not finalize the cut-out." };
    }
  }, []);

  const runWorker = useCallback(async () => {
    if (loopRunningRef.current) return;
    loopRunningRef.current = true;
    stopRef.current = false;

    try {
      while (isMountedRef.current && !stopRef.current) {
        // 1) Claim the next shoe from the server.
        let claim: { done?: boolean; item?: ClaimedItem | null; job?: NobgJob | null; stats?: NobgStats; ok?: boolean; error?: string };
        try {
          const res = await fetch("/api/admin/shoes/images/bulk-nobg/claim", { method: "POST" });
          claim = await res.json();
          if (!res.ok || !claim?.ok) throw new Error(claim?.error ?? "Failed to claim next item");
          failStreakRef.current = 0;
        } catch (err) {
          failStreakRef.current += 1;
          if (failStreakRef.current >= 3) {
            if (isMountedRef.current) {
              setWorkerHalted(true);
              setError(err instanceof Error ? err.message : translate("Background removal failed."));
            }
            break;
          }
          continue;
        }

        if (isMountedRef.current) applyJob(claim.job, claim.stats);
        if (claim.done) break;
        if (!claim.item) continue; // server skipped it internally — ask again

        const item = claim.item;
        if (isMountedRef.current) setWorkerStatus(translate("Cutting out") + ` ${item.shoeLabel}…`);

        // 2) Do the WASM removal, QA and framing in the browser.
        const result = await cutOut(item);

        // 3) Commit the outcome so the server swaps in (or records) the result.
        try {
          const fd = new FormData();
          fd.append("itemId", item.itemId);
          fd.append("outcome", result.kind);
          if (result.kind === "success") {
            fd.append("file", result.blob, "cutout.png");
            fd.append("source_url", item.sourcePublicUrl);
          } else if (result.kind === "skipped") {
            fd.append("reason", result.reason);
          } else {
            fd.append("error", result.error);
          }
          const res = await fetch("/api/admin/shoes/images/bulk-nobg/commit", { method: "POST", body: fd });
          const json = await res.json();
          if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Failed to record result");
          if (isMountedRef.current) applyJob(json.job, json.stats);
          failStreakRef.current = 0;
        } catch (err) {
          failStreakRef.current += 1;
          if (failStreakRef.current >= 3) {
            if (isMountedRef.current) {
              setWorkerHalted(true);
              setError(err instanceof Error ? err.message : translate("Background removal failed."));
            }
            break;
          }
        }
      }
    } finally {
      loopRunningRef.current = false;
      if (isMountedRef.current) setWorkerStatus(null);
      try {
        await loadStatus();
      } catch {
        // best effort
      }
    }
  }, [applyJob, cutOut, loadStatus, translate]);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function bootstrap() {
      try {
        await loadStatus();
      } catch (err) {
        if (!cancelled && isMountedRef.current) setError(err instanceof Error ? err.message : "Failed to load status");
      }
    }
    bootstrap();

    const interval = setInterval(async () => {
      try {
        await loadStatus();
      } catch {
        // best effort
      }
    }, 3500);

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      stopRef.current = true;
      clearInterval(interval);
    };
  }, [loadStatus]);

  // Whenever a job is running and no worker loop is active, start driving it.
  // This also resumes a job after a page reload (the browser is the worker).
  useEffect(() => {
    if (activeJob?.status === "running" && !loopRunningRef.current && !workerHalted) {
      void runWorker();
    }
  }, [activeJob, workerHalted, runWorker]);

  useEffect(() => {
    if (selectedShoeIds.length === 0) return;
    const availableSet = new Set(availableShoes.map((shoe) => shoe.id));
    setSelectedShoeIds((prev) => prev.filter((id) => availableSet.has(id)));
  }, [availableShoes, selectedShoeIds.length]);

  function toggleSelection(shoeId: string) {
    if (isBusy) return;
    setSelectedShoeIds((prev) => (prev.includes(shoeId) ? prev.filter((id) => id !== shoeId) : [...prev, shoeId]));
  }

  async function startRemoval() {
    if (isBusy) return;
    if (quantityError) {
      setError(quantityError);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);
    failStreakRef.current = 0;
    setWorkerHalted(false);

    const parsedQuantity = Number(quantityInput.trim());

    try {
      const response = await fetch("/api/admin/shoes/images/bulk-nobg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: selectedShoeIds.length > 0 ? null : parsedQuantity,
          selectedShoeIds
        })
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Bulk background removal failed");
      setMessage(
        selectedShoeIds.length > 0
          ? translate(`Started removal for ${selectedShoeIds.length} selected shoe(s).`)
          : translate(`Started removal for ${parsedQuantity} shoe(s).`)
      );
      applyJob(json.job, json.stats);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk background removal failed");
      setMessage(null);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  async function stopRemoval() {
    if (stopping) return;
    setStopping(true);
    setError(null);
    stopRef.current = true;
    failStreakRef.current = 0;
    setWorkerHalted(false);
    try {
      const response = await fetch("/api/admin/shoes/images/bulk-nobg/abort", { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json?.ok) throw new Error(json?.error ?? json?.message ?? "Failed to stop");
      setMessage(translate(json?.message ?? "Stopped"));
      applyJob(null, json.stats);
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request stop");
    } finally {
      if (isMountedRef.current) setStopping(false);
    }
  }

  const displayJob = activeJob ?? latestJob;

  return (
    <div className="space-y-3 rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.55)] p-4">
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <p><span className="soft-text">{translate("Backgrounds to remove")}: </span><span className="num-display font-semibold">{stats.remaining}</span></p>
        <p><span className="soft-text">{translate("Total shoes")}: </span><span className="num-display font-semibold">{stats.totalShoes}</span></p>
      </div>

      <div className="space-y-2 rounded-xl border border-[rgb(var(--muted)/0.35)] p-3">
        <label className="text-sm font-medium">{translate("Quantity (used only when no shoes are selected)")}</label>
        <Input
          type="number"
          min={1}
          max={maxQuantity}
          value={quantityInput}
          onChange={(event) => setQuantityInput(event.target.value)}
          disabled={isBusy}
          inputMode="numeric"
        />
        {quantityError ? <p className="text-xs text-[rgb(var(--error))]">{quantityError}</p> : null}
      </div>

      <div className="space-y-2 rounded-xl border border-[rgb(var(--muted)/0.35)] p-3">
        <div className="flex items-center justify-between gap-2">
          <label className="text-sm font-medium">{translate("Select shoes (takes priority over quantity)")}</label>
          <p className="text-xs soft-text">{selectedShoeIds.length} {translate("selected")}</p>
        </div>
        <Input
          type="text"
          value={shoeSearch}
          onChange={(event) => setShoeSearch(event.target.value)}
          placeholder={translate("Search shoes...")}
          disabled={isBusy}
        />
        <div className="max-h-44 overflow-auto rounded-lg border border-[rgb(var(--muted)/0.3)] p-2 text-sm">
          {filteredShoes.length === 0 ? (
            <p className="soft-text">{translate("No matching shoes.")}</p>
          ) : (
            filteredShoes.map((shoe) => (
              <label key={shoe.id} className="flex min-h-[40px] cursor-pointer items-center gap-2.5 py-1 md:min-h-0 md:gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={selectedShoeIds.includes(shoe.id)}
                  onChange={() => toggleSelection(shoe.id)}
                  disabled={isBusy}
                />
                <span>{shoe.label}</span>
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button type="button" onClick={startRemoval} disabled={isBusy || Boolean(quantityError)}>
          {isRunning || isStopping ? translate("Bulk job in progress") : loading ? translate("Starting...") : translate("Remove backgrounds")}
        </Button>
        {(isRunning || isStopping) && (
          <Button type="button" variant="secondary" onClick={stopRemoval} disabled={isStopping}>
            {isStopping ? translate("Stopping...") : translate("Stop")}
          </Button>
        )}
      </div>

      <p className="text-xs soft-text">
        {translate("Cut-outs are computed in this browser — keep this tab open until it finishes.")}
      </p>

      {message && <FeedbackMessage message={message} />}
      {error && <FeedbackMessage message={error} isError />}

      {displayJob ? (
        <div className="space-y-2 text-sm">
          <p className="font-medium">
            {translate("Status")}: {
              displayJob.status === "running"
                ? translate("Running")
                : displayJob.status === "cancel_requested"
                  ? translate("Stopping...")
                  : displayJob.status === "cancelled"
                    ? translate("Stopped")
                    : displayJob.status === "completed"
                      ? translate("Completed")
                      : translate("Failed")
            }
          </p>
          <p>{translate("Progress")}: <span className="num-display">{displayJob.processed_count} / {displayJob.total_count}</span></p>
          <div className="h-2 w-full rounded-full bg-[rgb(var(--muted)/0.35)]">
            <div className="h-2 rounded-full bg-[rgb(var(--accent))]" style={{ width: `${progressPercent}%` }} />
          </div>
          <p>{translate("Removed and approved")}: <span className="num-display">{displayJob.success_count}</span></p>
          <p>{translate("Skipped")}: <span className="num-display">{displayJob.skip_count}</span></p>
          <p>{translate("Failed")}: <span className="num-display">{displayJob.failure_count}</span></p>
          <p>{translate("Unprocessed")}: <span className="num-display">{Math.max(0, displayJob.total_count - displayJob.processed_count)}</span></p>
          {workerStatus ? <p className="soft-text">{workerStatus}</p> : displayJob.current_shoe_label ? <p>{translate("Current shoe")}: {displayJob.current_shoe_label}</p> : null}
        </div>
      ) : (
        <p className="text-sm soft-text">{translate("No active bulk job")}</p>
      )}

      {latestItems.length > 0 && (
        <div className="text-xs soft-text">
          {latestItems.slice(0, 5).map((item) => (
            <p key={`${item.shoe_id}-${item.status}`}>
              • {item.shoe_label}: {item.status === "failed" ? `${translate("Failed")}${item.error_message ? ` (${item.error_message})` : ""}` : translate("Skipped")}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
