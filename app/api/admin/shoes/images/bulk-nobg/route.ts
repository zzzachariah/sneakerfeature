import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";
import {
  computeNobgStats,
  createNobgJob,
  getActiveNobgJob,
  getLatestNobgJob,
  getNobgJobItemsSummary,
  listNobgTargets,
  MAX_BULK_NOBG_QUANTITY
} from "@/lib/admin/bulk-nobg-jobs";

export async function GET() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;

  try {
    const [stats, latestJob, activeJob, availableShoes] = await Promise.all([
      computeNobgStats(supabase),
      getLatestNobgJob(supabase),
      getActiveNobgJob(supabase),
      listNobgTargets(supabase)
    ]);

    const items = latestJob ? await getNobgJobItemsSummary(supabase, latestJob.id) : [];

    return NextResponse.json({
      ok: true,
      stats,
      active_job: activeJob,
      latest_job: latestJob,
      latest_items: items,
      available_shoes: availableShoes,
      max_quantity: MAX_BULK_NOBG_QUANTITY
    });
  } catch (error) {
    console.error("[admin] bulk-nobg status step=load fail:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load bulk background-removal status.", detail: error instanceof Error ? error.message : "unknown_error" },
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

  // Fail fast before creating a job: the commit endpoint that swaps in each
  // cut-out needs the service-role key + Supabase URL to upload, so starting a
  // job without them would leave a permanently stuck "running" job.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!supabaseUrl || !hasServiceRoleKey) {
    const detail = `SUPABASE_SERVICE_ROLE_KEY=${hasServiceRoleKey} supabaseUrl=${Boolean(supabaseUrl)}`;
    console.error(`[admin] bulk-nobg start step=env fail: ${detail}`);
    return NextResponse.json({ ok: false, error: "Storage environment variables are incomplete.", detail }, { status: 500 });
  }

  try {
    const created = await createNobgJob({ supabase, userId: user.id, selectedShoeIds, quantity });
    const stats = await computeNobgStats(supabase);

    return NextResponse.json({
      ok: true,
      message: created.created ? "Bulk background removal started" : "Bulk job in progress",
      started_new_job: created.created,
      job: created.job,
      stats
    });
  } catch (error) {
    console.error("[admin] bulk-nobg start step=create fail:", error);
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to start bulk background-removal job." },
      { status: 400 }
    );
  }
}
