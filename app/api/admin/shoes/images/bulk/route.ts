import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { getSerpApiConfig } from "@/lib/admin/shoe-image-import";
import {
  computeBulkImageStats,
  createBulkJob,
  getActiveBulkJob,
  getBulkJobItemsSummary,
  getLatestBulkJob,
  listMissingBulkTargetShoes,
  MAX_BULK_QUANTITY
} from "@/lib/admin/bulk-image-jobs";

export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;

  try {
    const [stats, latestJob, activeJob, availableShoes] = await Promise.all([
      computeBulkImageStats(supabase),
      getLatestBulkJob(supabase),
      getActiveBulkJob(supabase),
      listMissingBulkTargetShoes(supabase)
    ]);

    const items = latestJob ? await getBulkJobItemsSummary(supabase, latestJob.id) : [];

    return NextResponse.json({
      ok: true,
      stats,
      active_job: activeJob,
      latest_job: latestJob,
      latest_items: items,
      available_shoes: availableShoes,
      max_quantity: MAX_BULK_QUANTITY
    });
  } catch (error) {
    console.error("[admin] bulk-image status step=load fail:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load bulk image job status.", detail: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase, user } = auth;

  let payload: { quantity?: unknown; selectedShoeIds?: unknown } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const selectedShoeIds = Array.isArray(payload.selectedShoeIds)
    ? payload.selectedShoeIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  const parsedQuantity = typeof payload.quantity === "number" ? payload.quantity : Number(payload.quantity);
  const quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : undefined;

  // Fail fast before creating a job: the tick endpoint that processes items
  // needs the SerpApi env vars and the service role key, so starting a job
  // without them would leave a permanently stuck "running" job.
  const config = getSerpApiConfig();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!config || !supabaseUrl || !hasServiceRoleKey) {
    const detail = `SERP_API_PROVIDER=${Boolean(process.env.SERP_API_PROVIDER)} SERP_API_KEY=${Boolean(process.env.SERP_API_KEY)} SERP_API_ENGINE=${Boolean(process.env.SERP_API_ENGINE)} SUPABASE_SERVICE_ROLE_KEY=${hasServiceRoleKey} supabaseUrl=${Boolean(supabaseUrl)}`;
    console.error(`[admin] bulk-image start step=env fail: ${detail}`);
    return NextResponse.json(
      { ok: false, error: "Search/import environment variables are incomplete.", detail },
      { status: 500 }
    );
  }

  try {
    const created = await createBulkJob({
      supabase,
      userId: user.id,
      selectedShoeIds,
      quantity
    });
    const stats = await computeBulkImageStats(supabase);

    return NextResponse.json({
      ok: true,
      message: created.created ? "Bulk image import started" : "Bulk job in progress",
      started_new_job: created.created,
      job: created.job,
      stats
    });
  } catch (error) {
    console.error("[admin] bulk-image start step=create fail:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to start bulk image import job." },
      { status: 400 }
    );
  }
}
