"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { useLocale } from "@/components/i18n/locale-provider";
import { Input } from "@/components/ui/input";

type BulkStats = {
  totalShoes: number;
  missingApprovedImages: number;
};

type BulkJob = {
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

type BulkJobItem = {
  shoe_id: string;
  shoe_label: string;
  status: "failed" | "skipped";
  error_message?: string | null;
};

type BulkSelectableShoe = {
  id: string;
  label: string;
  brand: string;
  shoe_name: string;
  release_year?: number | null;
};

type BulkStatusPayload = {
  stats?: BulkStats;
  active_job?: BulkJob | null;
  latest_job?: BulkJob | null;
  latest_items?: BulkJobItem[];
  available_shoes?: BulkSelectableShoe[];
  max_quantity?: number;
};

export function BulkImageImportButton() {
  const { translate } = useLocale();
  const [stats, setStats] = useState<BulkStats>({ totalShoes: 0, missingApprovedImages: 0 });
  const [activeJob, setActiveJob] = useState<BulkJob | null>(null);
  const [latestJob, setLatestJob] = useState<BulkJob | null>(null);
  const [latestItems, setLatestItems] = useState<BulkJobItem[]>([]);
  const [availableShoes, setAvailableShoes] = useState<BulkSelectableShoe[]>([]);
  const [selectedShoeIds, setSelectedShoeIds] = useState<string[]>([]);
  const [shoeSearch, setShoeSearch] = useState("");
  const [quantityInput, setQuantityInput] = useState("20");
  const [maxQuantity, setMaxQuantity] = useState(200);
  const [loading, setLoading] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const isMountedRef = useRef(true);

  const progressPercent = useMemo(() => {
    const total = activeJob?.total_count ?? latestJob?.total_count ?? 0;
    const processed = activeJob?.processed_count ?? latestJob?.processed_count ?? 0;
    if (!total) return 0;
    return Math.min(100, Math.round((processed / total) * 100));
  }, [activeJob, latestJob]);

  const hydrateState = useCallback((payload: BulkStatusPayload) => {
    setStats(payload.stats ?? { totalShoes: 0, missingApprovedImages: 0 });
    setActiveJob(payload.active_job ?? null);
    setLatestJob(payload.latest_job ?? null);
    setLatestItems(payload.latest_items ?? []);
    setAvailableShoes(payload.available_shoes ?? []);
    if (typeof payload.max_quantity === "number" && payload.max_quantity > 0) {
      setMaxQuantity(payload.max_quantity);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/admin/shoes/images/bulk", { method: "GET", cache: "no-store" });
    const json = (await response.json()) as BulkStatusPayload & { ok?: boolean; error?: string };
    if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Failed to load bulk image status");
    hydrateState(json);
  }, [hydrateState]);

  const tickJob = useCallback(async () => {
    const response = await fetch("/api/admin/shoes/images/bulk/tick", { method: "POST" });
    const json = await response.json();
    if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Failed to update bulk image progress");
    setStats((prev) => json?.stats ?? prev);
    setActiveJob(json?.job?.status === "running" || json?.job?.status === "cancel_requested" ? json.job : null);
    setLatestJob((prev) => json?.job ?? prev);
  }, []);

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

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    async function bootstrap() {
      try {
        await loadStatus();
      } catch (err) {
        if (!cancelled && isMountedRef.current) setError(err instanceof Error ? err.message : "Failed to load bulk status");
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
      clearInterval(interval);
    };
  }, [loadStatus]);

  useEffect(() => {
    if (!activeJob || activeJob.status !== "running") return;

    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      try {
        await tickJob();
        await loadStatus();
      } catch {
        // continue polling
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeJob, tickJob, loadStatus]);

  useEffect(() => {
    if (selectedShoeIds.length === 0) return;
    const availableSet = new Set(availableShoes.map((shoe) => shoe.id));
    setSelectedShoeIds((prev) => prev.filter((id) => availableSet.has(id)));
  }, [availableShoes, selectedShoeIds.length]);

  function toggleSelection(shoeId: string) {
    if (isBusy) return;
    setSelectedShoeIds((prev) => (prev.includes(shoeId) ? prev.filter((id) => id !== shoeId) : [...prev, shoeId]));
  }

  async function startBulkImport() {
    if (isBusy) return;
    if (quantityError) {
      setError(quantityError);
      return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    const parsedQuantity = Number(quantityInput.trim());

    try {
      const response = await fetch("/api/admin/shoes/images/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantity: selectedShoeIds.length > 0 ? null : parsedQuantity,
          selectedShoeIds
        })
      });
      const json = await response.json();
      if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Bulk image import failed");
      setMessage(
        selectedShoeIds.length > 0
          ? translate(`Started generation for ${selectedShoeIds.length} selected shoe(s).`)
          : translate(`Started generation for ${parsedQuantity} shoe(s).`)
      );
      hydrateState({ stats: json?.stats, active_job: json?.job, latest_job: json?.job, latest_items: latestItems });
      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk image import failed");
      setMessage(null);
    } finally {
      if (isMountedRef.current) setLoading(false);
    }
  }

  async function abortBulkImport() {
    if (stopping) return;

    setStopping(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/shoes/images/bulk/abort", { method: "POST" });
      const json = await response.json();
      if (!response.ok || !json?.ok) throw new Error(json?.error ?? json?.message ?? "Failed to stop");
      setMessage(translate(json?.message ?? "Stopped"));
      hydrateState({ stats: json?.stats, active_job: null, latest_job: json?.job, latest_items: latestItems });
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
        <p><span className="soft-text">{translate("Missing approved images")}: </span><span className="num-display font-semibold">{stats.missingApprovedImages}</span></p>
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
        {quantityError ? <p className="text-xs text-rose-400">{quantityError}</p> : null}
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
              <label key={shoe.id} className="flex cursor-pointer items-center gap-2 py-1">
                <input
                  type="checkbox"
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

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={startBulkImport} disabled={isBusy || Boolean(quantityError)}>
          {isRunning || isStopping ? translate("Bulk job in progress") : loading ? translate("Starting...") : translate("Generate images")}
        </Button>
        {(isRunning || isStopping) && (
          <Button type="button" variant="secondary" onClick={abortBulkImport} disabled={isStopping}>
            {isStopping ? translate("Stopping...") : translate("Stop")}
          </Button>
        )}
      </div>

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
          <p>{translate("Imported and approved")}: <span className="num-display">{displayJob.success_count}</span></p>
          <p>{translate("Skipped")}: <span className="num-display">{displayJob.skip_count}</span></p>
          <p>{translate("Failed")}: <span className="num-display">{displayJob.failure_count}</span></p>
          <p>{translate("Unprocessed")}: <span className="num-display">{Math.max(0, displayJob.total_count - displayJob.processed_count)}</span></p>
          {displayJob.current_shoe_label ? <p>{translate("Current shoe")}: {displayJob.current_shoe_label}</p> : null}
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
