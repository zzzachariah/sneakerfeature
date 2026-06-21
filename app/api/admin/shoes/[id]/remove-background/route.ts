import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;
const MIN_BYTES = 1024;

// Admin-only: accept a background-removed PNG cut out in the admin's browser
// (@imgly/background-removal) and queue it as the shoe's PENDING image. The
// existing approve/reject controls then confirm or discard it — so the cut-out
// is previewed before it can replace the live image, and nothing is destroyed
// (history is kept in shoe_images). Background removal runs in the browser, not
// here, because Vercel's serverless runtime can't host the model.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ ok: false, message: "Supabase service role key is not configured." }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ ok: false, message: "Supabase URL is not configured." }, { status: 500 });
  }

  const { id: shoeId } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Expected multipart form data." }, { status: 400 });
  }

  const file = form.get("file");
  const sourceUrl = (form.get("source_url") as string | null)?.trim() || null;
  if (!(file instanceof Blob)) {
    return NextResponse.json({ ok: false, message: "Missing cut-out file." }, { status: 400 });
  }
  if (file.type && file.type !== "image/png") {
    return NextResponse.json({ ok: false, message: "Cut-out must be a PNG." }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength < MIN_BYTES) {
    return NextResponse.json({ ok: false, message: "Cut-out is empty or too small." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, message: "Cut-out is too large." }, { status: 413 });
  }

  const { data: shoe, error: shoeError } = await supabase.from("shoes").select("id").eq("id", shoeId).maybeSingle();
  if (shoeError || !shoe) {
    return NextResponse.json({ ok: false, message: "Shoe not found." }, { status: 404 });
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "shoe-images";
  const path = `shoes/${shoeId}/${Date.now()}-${randomUUID()}-nobg.png`;

  const { error: uploadError } = await adminClient.storage.from(bucket).upload(path, bytes, {
    upsert: false,
    contentType: "image/png"
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, message: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  const nowIso = new Date().toISOString();

  const { error: closePendingError } = await supabase
    .from("shoe_images")
    .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "Superseded by newer pending image." })
    .eq("shoe_id", shoeId)
    .eq("status", "pending");
  if (closePendingError) {
    return NextResponse.json({ ok: false, message: `DB update failed: ${closePendingError.message}` }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("shoe_images").insert({
    shoe_id: shoeId,
    storage_path: path,
    public_url: publicUrl,
    status: "pending",
    provider: "imgly-bg",
    selection_reason: "Background removed in admin browser (@imgly)",
    source_image_url: sourceUrl,
    created_by: user.id
  });
  if (insertError) {
    return NextResponse.json({ ok: false, message: `DB insert failed: ${insertError.message}` }, { status: 500 });
  }

  revalidateTag("shoes");
  return NextResponse.json({ ok: true, message: "Background removed — review the pending image.", public_url: publicUrl });
}
