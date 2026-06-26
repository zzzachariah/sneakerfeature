import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { downloadImageFromUrl, getSerpApiConfig, importBestShoeImage } from "@/lib/admin/shoe-image-import";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("find") }),
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject") }),
  z.object({ action: z.literal("preview_url"), source_url: z.string().url() }),
  z.object({
    action: z.literal("confirm_url"),
    source_url: z.string().url(),
    storage_path: z.string().min(1),
    public_url: z.string().url()
  })
]);

type ErrorStep = "request_parse" | "auth" | "shoe_load" | "env" | "search_request" | "db_update" | "db_insert" | "download" | "storage_upload";

function fail({
  status,
  error,
  step,
  detail,
  requestId
}: {
  status: number;
  error: string;
  step: ErrorStep;
  detail?: string;
  requestId: string;
}) {
  console.error(`[admin] /image requestId=${requestId} step=${step} fail status=${status}`, { error, detail });
  return NextResponse.json({ ok: false, error, step, detail }, { status });
}

function success(payload: Record<string, unknown>, requestId: string) {
  console.info(`[admin] /image requestId=${requestId} step=final_return success status=200`);
  revalidateTag("shoes");
  return NextResponse.json({ ok: true, ...payload }, { status: 200 });
}

async function getLatestByStatus(supabase: SupabaseClient, shoeId: string, status: "pending" | "approved") {
  const { data, error } = await supabase
    .from("shoe_images")
    .select("*")
    .eq("shoe_id", shoeId)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID();

  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase, user } = auth;
  const adminClient = createAdminClient();

  if (!adminClient) {
    return fail({
      status: 500,
      error: "Supabase service role key is not configured.",
      step: "env",
      requestId
    });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return fail({
      status: 400,
      error: "Invalid payload.",
      step: "request_parse",
      detail: parsed.error.issues[0]?.message,
      requestId
    });
  }

  const { id: shoeId } = await params;

  if (parsed.data.action === "approve") {
    const pending = await getLatestByStatus(supabase, shoeId, "pending");
    if (!pending) return fail({ status: 400, error: "No pending image to approve.", step: "db_update", requestId });

    if (pending.created_by !== user.id) {
      return fail({ status: 403, error: "You may only approve images you staged.", step: "db_update", requestId });
    }

    const nowIso = new Date().toISOString();

    const { error: demoteError } = await supabase
      .from("shoe_images")
      .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "Superseded by newer approved image." })
      .eq("shoe_id", shoeId)
      .eq("status", "approved");

    if (demoteError) {
      return fail({
        status: 500,
        error: "Failed to demote previous approved image.",
        step: "db_update",
        detail: demoteError.message,
        requestId
      });
    }

    const { error: approveError } = await supabase
      .from("shoe_images")
      .update({ status: "approved", approved_at: nowIso, rejected_at: null, rejection_reason: null })
      .eq("id", pending.id);

    if (approveError) {
      return fail({
        status: 500,
        error: "Failed to approve pending image.",
        step: "db_update",
        detail: approveError.message,
        requestId
      });
    }

    return success({ message: "Image approved" }, requestId);
  }

  if (parsed.data.action === "reject") {
    const pending = await getLatestByStatus(supabase, shoeId, "pending");
    if (!pending) return fail({ status: 400, error: "No pending image to reject.", step: "db_update", requestId });

    if (pending.created_by !== user.id) {
      return fail({ status: 403, error: "You may only reject images you staged.", step: "db_update", requestId });
    }

    const { error: rejectError } = await supabase
      .from("shoe_images")
      .update({
        status: "rejected",
        rejected_at: new Date().toISOString(),
        rejection_reason: "Rejected by admin review."
      })
      .eq("id", pending.id);

    if (rejectError) {
      return fail({
        status: 500,
        error: "Failed to reject pending image.",
        step: "db_update",
        detail: rejectError.message,
        requestId
      });
    }

    return success({ message: "Image rejected" }, requestId);
  }

  if (parsed.data.action === "preview_url") {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    if (!supabaseUrl) {
      return fail({
        status: 500,
        error: "Supabase URL is not configured.",
        step: "env",
        requestId
      });
    }

    const { data: shoe, error: shoeError } = await supabase
      .from("shoes")
      .select("id")
      .eq("id", shoeId)
      .maybeSingle();

    if (shoeError || !shoe) {
      return fail({
        status: 404,
        error: "Shoe not found.",
        step: "shoe_load",
        detail: shoeError?.message,
        requestId
      });
    }

    const download = await downloadImageFromUrl(parsed.data.source_url);
    if (!download.ok) {
      return fail({
        status: 502,
        error: "Image URL could not be downloaded",
        step: "download",
        detail: download.reason,
        requestId
      });
    }

    const extension = download.contentType.includes("png")
      ? "png"
      : download.contentType.includes("webp")
        ? "webp"
        : "jpg";
    const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "shoe-images";
    const path = `shoes/${shoeId}/${Date.now()}-${randomUUID()}.${extension}`;

    const { error: uploadError } = await adminClient.storage.from(bucket).upload(path, download.imageBytes, {
      upsert: false,
      contentType: download.contentType
    });

    if (uploadError) {
      return fail({
        status: 500,
        error: "Preview upload failed",
        step: "storage_upload",
        detail: uploadError.message,
        requestId
      });
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
    return success(
      {
        message: "Preview ready",
        storage_path: path,
        public_url: publicUrl,
        content_type: download.contentType
      },
      requestId
    );
  }

  if (parsed.data.action === "confirm_url") {
    // Verify the storage path belongs to this shoe to prevent path injection
    const expectedPrefix = `shoes/${shoeId}/`;
    if (!parsed.data.storage_path.startsWith(expectedPrefix)) {
      return fail({
        status: 400,
        error: "storage_path does not belong to this shoe.",
        step: "request_parse",
        requestId
      });
    }

    const nowIso = new Date().toISOString();

    const { error: closePendingError } = await supabase
      .from("shoe_images")
      .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "Superseded by newer pending import." })
      .eq("shoe_id", shoeId)
      .eq("status", "pending");

    if (closePendingError) {
      return fail({
        status: 500,
        error: "Failed to close previous pending image.",
        step: "db_update",
        detail: closePendingError.message,
        requestId
      });
    }

    let sourceDomain = "";
    try {
      sourceDomain = new URL(parsed.data.source_url).hostname;
    } catch {
      sourceDomain = "";
    }

    const { error: insertError } = await supabase.from("shoe_images").insert({
      shoe_id: shoeId,
      storage_path: parsed.data.storage_path,
      public_url: parsed.data.public_url,
      status: "pending",
      provider: "manual_url",
      source_image_url: parsed.data.source_url,
      source_domain: sourceDomain || null,
      source_type: "manual",
      selection_reason: "Admin pasted URL",
      created_by: user.id
    });

    if (insertError) {
      return fail({
        status: 500,
        error: "Image metadata insert failed",
        step: "db_insert",
        detail: insertError.message,
        requestId
      });
    }

    return success(
      {
        message: "Image imported for review",
        storage_path: parsed.data.storage_path,
        public_url: parsed.data.public_url,
        source_image_url: parsed.data.source_url
      },
      requestId
    );
  }

  const config = getSerpApiConfig();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!config || !supabaseUrl) {
    return fail({
      status: 500,
      error: "Search/import environment variables are incomplete.",
      step: "env",
      detail: `SERP_API_PROVIDER=${Boolean(process.env.SERP_API_PROVIDER)} SERP_API_KEY=${Boolean(process.env.SERP_API_KEY)} SERP_API_ENGINE=${Boolean(process.env.SERP_API_ENGINE)} supabaseUrl=${Boolean(supabaseUrl)}`,
      requestId
    });
  }

  const { data: shoe, error: shoeError } = await supabase
    .from("shoes")
    .select("id, brand, shoe_name, release_year")
    .eq("id", shoeId)
    .maybeSingle();

  if (shoeError || !shoe) {
    return fail({
      status: 404,
      error: "Shoe not found.",
      step: "shoe_load",
      detail: shoeError?.message,
      requestId
    });
  }

  try {
    const result = await importBestShoeImage({
      supabase,
      adminStorageClient: adminClient,
      shoe,
      mode: "single_pending",
      createdBy: user.id,
      supabaseUrl,
      bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "shoe-images"
    });

    if (!result.ok) {
      const status = result.error === "No suitable image found" ? 404 : result.error === "Selected image could not be downloaded" ? 502 : 500;
      return fail({
        status,
        error: result.error,
        step: result.error === "No suitable image found" ? "search_request" : result.error === "Selected image could not be downloaded" ? "search_request" : "db_insert",
        detail: result.detail,
        requestId
      });
    }

    return success(
      {
        message: "Image imported for review",
        storage_path: result.storagePath,
        public_url: result.publicUrl,
        source_image_url: result.sourceImageUrl,
        source_domain: result.sourceDomain,
        source_type: result.sourceType,
        selection_reason: result.selectionReason
      },
      requestId
    );
  } catch (error) {
    return fail({
      status: 502,
      error: "Image search failed",
      step: "search_request",
      detail: error instanceof Error ? error.message : "unknown_search_error",
      requestId
    });
  }
}
