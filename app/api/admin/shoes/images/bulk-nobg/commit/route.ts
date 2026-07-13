import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyNobgResult, computeNobgStats, type NobgCommitResult } from "@/lib/admin/bulk-nobg-jobs";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const MIN_BYTES = 1024;

// The browser worker POSTs the outcome of ONE claimed item here:
//   outcome=success  + file (transparent PNG)  -> swap it in as the new approved image
//   outcome=skipped  + reason                  -> keep the original (e.g. bad alpha coverage)
//   outcome=failed   + error                   -> record the failure and move on
export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ ok: false, error: "Supabase service role key is not configured." }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ ok: false, error: "Supabase URL is not configured." }, { status: 500 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected multipart form data." }, { status: 400 });
  }

  const itemId = (form.get("itemId") as string | null)?.trim() || "";
  if (!itemId) {
    return NextResponse.json({ ok: false, error: "Missing itemId." }, { status: 400 });
  }
  const outcome = (form.get("outcome") as string | null)?.trim() || "success";

  let result: NobgCommitResult;
  if (outcome === "failed") {
    result = { kind: "failed", error: (form.get("error") as string | null)?.trim() || "Browser removal failed." };
  } else if (outcome === "skipped") {
    result = { kind: "skipped", reason: (form.get("reason") as string | null)?.trim() || "unspecified" };
  } else {
    const file = form.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "Missing cut-out file." }, { status: 400 });
    }
    if (file.type && file.type !== "image/png") {
      return NextResponse.json({ ok: false, error: "Cut-out must be a PNG." }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.byteLength < MIN_BYTES) {
      return NextResponse.json({ ok: false, error: "Cut-out is empty or too small." }, { status: 400 });
    }
    if (bytes.byteLength > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: "Cut-out is too large." }, { status: 413 });
    }
    result = { kind: "success", pngBytes: bytes, sourceUrl: (form.get("source_url") as string | null)?.trim() || null };
  }

  try {
    const applied = await applyNobgResult({
      supabase,
      adminStorageClient: adminClient,
      supabaseUrl,
      bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "shoe-images",
      userId: user.id,
      itemId,
      result
    });
    const stats = await computeNobgStats(supabase);

    if (result.kind === "success") revalidateTag("shoes");
    return NextResponse.json({ ok: true, applied: applied.applied, job: applied.job, stats });
  } catch (error) {
    console.error("[admin] bulk-nobg commit step=apply fail:", error);
    return NextResponse.json(
      { ok: false, error: "Failed to record background-removal result.", detail: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 }
    );
  }
}
