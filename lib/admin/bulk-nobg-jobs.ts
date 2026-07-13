import { randomUUID } from "crypto";
import { SupabaseClient } from "@supabase/supabase-js";

export type BulkNobgJobStatus = "running" | "cancel_requested" | "cancelled" | "completed" | "failed";

const MAX_BULK_NOBG_QUANTITY = 200;

// Providers whose approved image is ALREADY a background-removed cut-out, so the
// shoe is not a target: rembg = the offline batch (scripts/remove-backgrounds),
// imgly-bg = the single-shoe admin button, imgly-bg-bulk = this bulk job.
const REMOVED_PROVIDERS = new Set(["rembg", "imgly-bg", "imgly-bg-bulk"]);

// Reset items left in `processing` by a browser that navigated away / crashed
// mid-cut, so the job self-heals instead of hanging on a stuck item. The browser
// worker re-claims them on the next tick.
const STALE_PROCESSING_MS = 90_000;

type ShoeRef = {
  id: string;
  brand: string;
  shoe_name: string;
  release_year?: number | null;
};

type ApprovedImageRow = {
  id: string;
  shoe_id: string;
  storage_path: string;
  public_url: string;
  provider: string | null;
  status: string;
  approved_at?: string | null;
  created_at: string;
  shoes: ShoeRef | null;
};

export type NobgTarget = {
  shoeId: string;
  label: string;
  brand: string;
  shoeName: string;
  releaseYear: number | null;
  imageId: string;
  storagePath: string;
  publicUrl: string;
};

type JobRow = {
  id: string;
  status: BulkNobgJobStatus;
  total_count: number;
  processed_count: number;
  success_count: number;
  skip_count: number;
  failure_count: number;
  started_at: string;
  updated_at: string;
  completed_at?: string | null;
  current_shoe_id?: string | null;
  current_shoe_label?: string | null;
  failure_summary?: unknown;
  cancel_requested_at?: string | null;
  cancelled_at?: string | null;
};

type ItemRow = {
  id: string;
  job_id: string;
  shoe_id: string;
  shoe_label: string;
  status: "pending" | "processing" | "success" | "skipped" | "failed";
  error_message?: string | null;
  source_image_url?: string | null;
  selection_reason?: string | null;
};

function shoeLabel(shoe: ShoeRef) {
  return `${shoe.brand} ${shoe.shoe_name}`.trim();
}

function approvedSortKey(row: ApprovedImageRow) {
  return new Date(row.approved_at ?? row.created_at).getTime();
}

// Latest approved image per shoe, matching resolveApprovedImage in lib/data/shoes.ts
// (sort approved rows by approved_at ?? created_at desc, take the first).
async function fetchLatestApprovedByShoe(supabase: SupabaseClient) {
  const latest = new Map<string, ApprovedImageRow>();
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("shoe_images")
      .select("id, shoe_id, storage_path, public_url, provider, status, approved_at, created_at, shoes!inner(id, brand, shoe_name, release_year)")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as ApprovedImageRow[];
    for (const row of batch) {
      if (!row.shoes) continue;
      const current = latest.get(row.shoe_id);
      if (!current || approvedSortKey(row) >= approvedSortKey(current)) latest.set(row.shoe_id, row);
    }
    if (batch.length < PAGE) break;
  }
  return latest;
}

function isTarget(row: ApprovedImageRow) {
  return !REMOVED_PROVIDERS.has(row.provider ?? "");
}

function toTarget(row: ApprovedImageRow): NobgTarget {
  const shoe = row.shoes as ShoeRef;
  return {
    shoeId: row.shoe_id,
    label: shoeLabel(shoe),
    brand: shoe.brand,
    shoeName: shoe.shoe_name,
    releaseYear: shoe.release_year ?? null,
    imageId: row.id,
    storagePath: row.storage_path,
    publicUrl: row.public_url
  };
}

export async function computeNobgStats(supabase: SupabaseClient) {
  const { count: totalShoes, error: shoesError } = await supabase.from("shoes").select("id", { count: "exact", head: true });
  if (shoesError) throw new Error(shoesError.message);

  const latest = await fetchLatestApprovedByShoe(supabase);
  let withApprovedImage = 0;
  let remaining = 0;
  for (const row of latest.values()) {
    withApprovedImage += 1;
    if (isTarget(row)) remaining += 1;
  }
  return { totalShoes: totalShoes ?? 0, withApprovedImage, remaining };
}

async function getNobgTargets(supabase: SupabaseClient): Promise<NobgTarget[]> {
  const latest = await fetchLatestApprovedByShoe(supabase);
  const targets: NobgTarget[] = [];
  for (const row of latest.values()) {
    if (isTarget(row)) targets.push(toTarget(row));
  }
  // Stable-ish order (oldest image first) so a --limit style quantity is predictable.
  targets.sort((a, b) => a.label.localeCompare(b.label));
  return targets;
}

export async function listNobgTargets(supabase: SupabaseClient, limit = 250) {
  const targets = await getNobgTargets(supabase);
  return targets.slice(0, Math.max(1, limit)).map((target) => ({
    id: target.shoeId,
    label: target.label,
    brand: target.brand,
    shoe_name: target.shoeName,
    release_year: target.releaseYear
  }));
}

// The latest approved image for one shoe, or null. Used when claiming so we
// always cut out whatever is live RIGHT NOW (not a stale snapshot from job
// creation time), and skip shoes whose image was already cut out meanwhile.
async function getLatestApprovedForShoe(supabase: SupabaseClient, shoeId: string): Promise<ApprovedImageRow | null> {
  const { data, error } = await supabase
    .from("shoe_images")
    .select("id, shoe_id, storage_path, public_url, provider, status, approved_at, created_at, shoes!inner(id, brand, shoe_name, release_year)")
    .eq("shoe_id", shoeId)
    .eq("status", "approved");
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as ApprovedImageRow[];
  if (!rows.length) return null;
  return rows.sort((a, b) => approvedSortKey(b) - approvedSortKey(a))[0] ?? null;
}

export async function getLatestNobgJob(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("admin_bulk_nobg_jobs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JobRow | null) ?? null;
}

export async function getActiveNobgJob(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("admin_bulk_nobg_jobs")
    .select("*")
    .in("status", ["running", "cancel_requested"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as JobRow | null) ?? null;
}

export async function createNobgJob({
  supabase,
  userId,
  selectedShoeIds,
  quantity
}: {
  supabase: SupabaseClient;
  userId: string;
  selectedShoeIds?: string[];
  quantity?: number;
}) {
  const running = await getActiveNobgJob(supabase);
  if (running) return { created: false as const, job: running };

  const allTargets = await getNobgTargets(supabase);

  const selectedSet = new Set((selectedShoeIds ?? []).filter(Boolean));
  let targets: NobgTarget[];
  if (selectedSet.size > 0) {
    targets = allTargets.filter((target) => selectedSet.has(target.shoeId));
  } else if (typeof quantity === "number") {
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_BULK_NOBG_QUANTITY) {
      throw new Error(`Quantity must be an integer between 1 and ${MAX_BULK_NOBG_QUANTITY}.`);
    }
    targets = allTargets.slice(0, quantity);
  } else {
    targets = allTargets;
  }

  const nowIso = new Date().toISOString();
  const { data: job, error: jobError } = await supabase
    .from("admin_bulk_nobg_jobs")
    .insert({
      status: "running",
      total_count: targets.length,
      processed_count: 0,
      success_count: 0,
      skip_count: 0,
      failure_count: 0,
      started_by: userId,
      started_at: nowIso,
      updated_at: nowIso
    })
    .select("*")
    .single();

  if (jobError) throw new Error(jobError.message);

  if (targets.length > 0) {
    const items = targets.map((target) => ({
      job_id: job.id,
      shoe_id: target.shoeId,
      shoe_label: target.label,
      status: "pending"
    }));
    const { error: itemsError } = await supabase.from("admin_bulk_nobg_job_items").insert(items);
    if (itemsError) throw new Error(itemsError.message);
  } else {
    const { error: completeError } = await supabase
      .from("admin_bulk_nobg_jobs")
      .update({ status: "completed", completed_at: nowIso, updated_at: nowIso })
      .eq("id", job.id);
    if (completeError) throw new Error(completeError.message);
  }

  return { created: true as const, job: await getLatestNobgJob(supabase) };
}

async function forceCancelNobgJob(supabase: SupabaseClient, jobId: string) {
  const nowIso = new Date().toISOString();

  const { error: resetError } = await supabase
    .from("admin_bulk_nobg_job_items")
    .update({ status: "pending", updated_at: nowIso })
    .eq("job_id", jobId)
    .eq("status", "processing");
  if (resetError) throw new Error(resetError.message);

  const { error } = await supabase
    .from("admin_bulk_nobg_jobs")
    .update({
      status: "cancelled",
      cancelled_at: nowIso,
      completed_at: nowIso,
      current_shoe_id: null,
      current_shoe_label: null,
      updated_at: nowIso
    })
    .eq("id", jobId)
    .in("status", ["running", "cancel_requested"]);
  if (error) throw new Error(error.message);
}

export async function requestNobgJobCancel({ supabase, userId }: { supabase: SupabaseClient; userId: string }) {
  const active = await getActiveNobgJob(supabase);
  if (!active) return { ok: false as const, message: "No active bulk job" };

  const nowIso = new Date().toISOString();
  if (active.status === "running") {
    const { error } = await supabase
      .from("admin_bulk_nobg_jobs")
      .update({
        status: "cancel_requested",
        cancel_requested_at: nowIso,
        updated_at: nowIso,
        failure_summary: [{ message: `Cancel requested by admin ${userId} at ${nowIso}` }]
      })
      .eq("id", active.id)
      .eq("status", "running");
    if (error) throw new Error(error.message);
  }

  await forceCancelNobgJob(supabase, active.id);
  return { ok: true as const, message: "Stopped", job: await getLatestNobgJob(supabase) };
}

export async function syncNobgCounters(supabase: SupabaseClient, jobId: string) {
  const { data: job } = await supabase.from("admin_bulk_nobg_jobs").select("status,cancelled_at,completed_at").eq("id", jobId).single();

  const { data: items, error } = await supabase.from("admin_bulk_nobg_job_items").select("status").eq("job_id", jobId);
  if (error) throw new Error(error.message);

  const counts = { processed: 0, success: 0, skipped: 0, failed: 0, processing: 0, pending: 0 };
  for (const item of items ?? []) {
    if (item.status === "success") {
      counts.success += 1;
      counts.processed += 1;
    } else if (item.status === "skipped") {
      counts.skipped += 1;
      counts.processed += 1;
    } else if (item.status === "failed") {
      counts.failed += 1;
      counts.processed += 1;
    } else if (item.status === "processing") {
      counts.processing += 1;
    } else if (item.status === "pending") {
      counts.pending += 1;
    }
  }

  const isDone = counts.pending === 0 && counts.processing === 0;
  const nowIso = new Date().toISOString();

  let status: BulkNobgJobStatus;
  if (job?.status === "cancelled") {
    status = "cancelled";
  } else if (job?.status === "cancel_requested") {
    status = isDone ? "cancelled" : "cancel_requested";
  } else {
    status = isDone ? "completed" : "running";
  }

  const { error: updateError } = await supabase
    .from("admin_bulk_nobg_jobs")
    .update({
      processed_count: counts.processed,
      success_count: counts.success,
      skip_count: counts.skipped,
      failure_count: counts.failed,
      status,
      completed_at: status === "completed" || status === "cancelled" ? (job?.completed_at ?? nowIso) : null,
      cancelled_at: status === "cancelled" ? (job?.cancelled_at ?? nowIso) : null,
      current_shoe_id: isDone ? null : undefined,
      current_shoe_label: isDone ? null : undefined,
      updated_at: nowIso
    })
    .eq("id", jobId);
  if (updateError) throw new Error(updateError.message);
  return getLatestNobgJob(supabase);
}

async function refreshFailureSummary(supabase: SupabaseClient, jobId: string) {
  const { data: failedItems } = await supabase
    .from("admin_bulk_nobg_job_items")
    .select("shoe_label, error_message")
    .eq("job_id", jobId)
    .eq("status", "failed")
    .order("updated_at", { ascending: false })
    .limit(6);
  await supabase
    .from("admin_bulk_nobg_jobs")
    .update({ failure_summary: failedItems ?? [], updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

export type ClaimedNobgItem = {
  itemId: string;
  shoeId: string;
  shoeLabel: string;
  sourcePublicUrl: string;
  sourceStoragePath: string;
};

// Hand the browser worker the next shoe to cut out. Claims one pending item
// (pending -> processing) and returns its live approved image. When there is no
// more work (or the job was cancelled) `done` is true. When an item is claimed
// but turns out to need no work (image vanished or was already cut out), it is
// marked skipped and `item` is null so the worker simply asks again.
export async function claimNextNobgItem({ supabase }: { supabase: SupabaseClient }) {
  const active = await getActiveNobgJob(supabase);
  if (!active) return { done: true as const, item: null, job: await getLatestNobgJob(supabase) };

  if (active.status === "cancel_requested") {
    await forceCancelNobgJob(supabase, active.id);
    return { done: true as const, item: null, job: await getLatestNobgJob(supabase) };
  }

  // Self-heal items abandoned in `processing` by a dropped browser session.
  const staleCutoff = new Date(Date.now() - STALE_PROCESSING_MS).toISOString();
  await supabase
    .from("admin_bulk_nobg_job_items")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("job_id", active.id)
    .eq("status", "processing")
    .lt("updated_at", staleCutoff);

  const { data: nextItem, error: nextItemError } = await supabase
    .from("admin_bulk_nobg_job_items")
    .select("*")
    .eq("job_id", active.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextItemError) throw new Error(nextItemError.message);

  if (!nextItem) {
    const synced = await syncNobgCounters(supabase, active.id);
    return { done: synced?.status !== "running" && synced?.status !== "cancel_requested", item: null, job: synced };
  }

  const { data: claimedRows, error: claimError } = await supabase
    .from("admin_bulk_nobg_job_items")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", nextItem.id)
    .eq("status", "pending")
    .select("id");
  if (claimError) throw new Error(claimError.message);
  if (!claimedRows?.length) return { done: false as const, item: null, job: await getLatestNobgJob(supabase) };

  await supabase
    .from("admin_bulk_nobg_jobs")
    .update({ current_shoe_id: nextItem.shoe_id, current_shoe_label: nextItem.shoe_label, updated_at: new Date().toISOString() })
    .eq("id", active.id);

  // Cancel could have landed between the claim and here — release and stop.
  const { data: jobStateNow } = await supabase.from("admin_bulk_nobg_jobs").select("status").eq("id", active.id).single();
  if (jobStateNow?.status === "cancel_requested" || jobStateNow?.status === "cancelled") {
    await supabase
      .from("admin_bulk_nobg_job_items")
      .update({ status: "pending", updated_at: new Date().toISOString() })
      .eq("id", nextItem.id)
      .eq("status", "processing");
    await forceCancelNobgJob(supabase, active.id);
    return { done: true as const, item: null, job: await getLatestNobgJob(supabase) };
  }

  const approved = await getLatestApprovedForShoe(supabase, nextItem.shoe_id);
  if (!approved) {
    await supabase
      .from("admin_bulk_nobg_job_items")
      .update({ status: "skipped", error_message: "Skipped: no approved image to process.", updated_at: new Date().toISOString() })
      .eq("id", nextItem.id);
    const synced = await syncNobgCounters(supabase, active.id);
    return { done: false as const, item: null, job: synced };
  }
  if (!isTarget(approved)) {
    await supabase
      .from("admin_bulk_nobg_job_items")
      .update({ status: "skipped", error_message: "Skipped: background already removed.", updated_at: new Date().toISOString() })
      .eq("id", nextItem.id);
    const synced = await syncNobgCounters(supabase, active.id);
    return { done: false as const, item: null, job: synced };
  }

  const item: ClaimedNobgItem = {
    itemId: nextItem.id,
    shoeId: nextItem.shoe_id,
    shoeLabel: nextItem.shoe_label,
    sourcePublicUrl: approved.public_url,
    sourceStoragePath: approved.storage_path
  };
  return { done: false as const, item, job: await getLatestNobgJob(supabase) };
}

export type NobgCommitResult =
  | { kind: "success"; pngBytes: Buffer; sourceUrl: string | null }
  | { kind: "skipped"; reason: string }
  | { kind: "failed"; error: string };

// Record the browser worker's outcome for one claimed item. On success the
// transparent PNG becomes the shoe's new approved image and the old one is
// demoted to rejected (reversible history, exactly like the offline batch).
export async function applyNobgResult({
  supabase,
  adminStorageClient,
  supabaseUrl,
  bucket,
  userId,
  itemId,
  result
}: {
  supabase: SupabaseClient;
  adminStorageClient: SupabaseClient;
  supabaseUrl: string;
  bucket: string;
  userId: string;
  itemId: string;
  result: NobgCommitResult;
}) {
  const { data: item, error: itemError } = await supabase
    .from("admin_bulk_nobg_job_items")
    .select("id, job_id, shoe_id, status")
    .eq("id", itemId)
    .maybeSingle();
  if (itemError) throw new Error(itemError.message);
  if (!item) throw new Error("Job item not found.");

  const jobId = (item as ItemRow).job_id;

  // Idempotency: only a claimed (processing) item can be committed. A late/retry
  // commit for an item that was reset or already recorded is a no-op.
  if ((item as ItemRow).status !== "processing") {
    return { applied: false as const, job: await getLatestNobgJob(supabase) };
  }

  const nowIso = new Date().toISOString();

  if (result.kind === "failed") {
    await supabase
      .from("admin_bulk_nobg_job_items")
      .update({ status: "failed", error_message: result.error.slice(0, 1800), updated_at: nowIso })
      .eq("id", itemId)
      .eq("status", "processing");
  } else if (result.kind === "skipped") {
    await supabase
      .from("admin_bulk_nobg_job_items")
      .update({ status: "skipped", error_message: `Skipped: ${result.reason}`.slice(0, 1800), updated_at: nowIso })
      .eq("id", itemId)
      .eq("status", "processing");
  } else {
    const shoeId = (item as ItemRow).shoe_id;
    const path = `shoes/${shoeId}/${Date.now()}-${randomUUID()}-nobg.png`;

    const { error: uploadError } = await adminStorageClient.storage.from(bucket).upload(path, result.pngBytes, {
      upsert: false,
      contentType: "image/png"
    });
    if (uploadError) {
      await supabase
        .from("admin_bulk_nobg_job_items")
        .update({ status: "failed", error_message: `Upload failed: ${uploadError.message}`.slice(0, 1800), updated_at: nowIso })
        .eq("id", itemId)
        .eq("status", "processing");
    } else {
      const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;

      // Insert the new approved row FIRST, then demote the old one. If the
      // demote were to fail (or run first and the insert fail), the shoe would
      // otherwise be left with no approved image at all. Inserting first means
      // the newest approved row (this one, by approved_at) always wins in
      // resolveApprovedImage, so the shoe never loses its picture.
      const { data: inserted, error: insertError } = await supabase
        .from("shoe_images")
        .insert({
          shoe_id: shoeId,
          storage_path: path,
          public_url: publicUrl,
          status: "approved",
          provider: "imgly-bg-bulk",
          selection_reason: "Background removed in admin browser (@imgly, bulk)",
          source_image_url: result.sourceUrl,
          created_by: userId,
          approved_at: nowIso
        })
        .select("id")
        .single();

      if (insertError || !inserted) {
        await supabase
          .from("admin_bulk_nobg_job_items")
          .update({ status: "failed", error_message: `DB write failed: ${insertError?.message ?? "no row"}`.slice(0, 1800), updated_at: nowIso })
          .eq("id", itemId)
          .eq("status", "processing");
      } else {
        await supabase
          .from("shoe_images")
          .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "Superseded by background-removed version." })
          .eq("shoe_id", shoeId)
          .eq("status", "approved")
          .neq("id", inserted.id);

        await supabase
          .from("admin_bulk_nobg_job_items")
          .update({
            status: "success",
            source_image_url: result.sourceUrl,
            selection_reason: "Background removed in admin browser (@imgly, bulk)",
            error_message: null,
            updated_at: nowIso
          })
          .eq("id", itemId)
          .eq("status", "processing");
      }
    }
  }

  await syncNobgCounters(supabase, jobId);
  await refreshFailureSummary(supabase, jobId);
  return { applied: true as const, job: await getLatestNobgJob(supabase) };
}

export async function getNobgJobItemsSummary(supabase: SupabaseClient, jobId: string) {
  const { data: items, error } = await supabase
    .from("admin_bulk_nobg_job_items")
    .select("shoe_id, shoe_label, status, error_message")
    .eq("job_id", jobId)
    .in("status", ["failed", "skipped"])
    .order("updated_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  return items ?? [];
}

export type BulkNobgJobRecord = JobRow;
export type BulkNobgJobItemRecord = ItemRow;
export { MAX_BULK_NOBG_QUANTITY };
