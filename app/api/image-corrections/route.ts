import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { PENDING_CORRECTIONS_BUCKET, sanitizeUploadedImage } from "@/lib/images/sanitize-upload";

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

// A logged-in user uploads an image they believe better represents a shoe. We
// store the file in the public `shoe-images` bucket and record a pending row in
// `image_corrections` for the admin to review. Approval (see the admin route)
// promotes the file to the shoe's live image.
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, message: "Expected a multipart form upload." }, { status: 400 });
  }

  const shoeId = String(form.get("shoe_id") ?? "").trim();
  const note = String(form.get("note") ?? "").trim().slice(0, 500);
  const file = form.get("file");

  if (!shoeId) {
    return NextResponse.json({ ok: false, message: "Missing shoe reference." }, { status: 400 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ ok: false, message: "Please choose an image to upload." }, { status: 400 });
  }
  if (!ALLOWED[file.type]) {
    return NextResponse.json({ ok: false, message: "Only JPG, PNG, or WebP images are allowed." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ ok: false, message: "Image is too large. Keep it under 6 MB." }, { status: 400 });
  }

  const serverClient = await createClient();
  if (!serverClient) {
    return NextResponse.json({ ok: false, message: "Database client is not configured." }, { status: 500 });
  }

  const {
    data: { user },
    error: userError
  } = await serverClient.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ ok: false, message: "Please log in to suggest an image correction." }, { status: 401 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, message: "Admin database client is not configured." }, { status: 500 });
  }

  const { count, error: countError } = await supabase
    .from("image_corrections")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "pending")
    .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

  if (countError) {
    return NextResponse.json({ ok: false, message: "Could not verify upload limit." }, { status: 500 });
  }
  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { ok: false, message: "You have reached the limit of 5 pending corrections per hour. Please wait before submitting again." },
      { status: 429 }
    );
  }

  const { data: shoe } = await supabase.from("shoes").select("id").eq("id", shoeId).maybeSingle();
  if (!shoe) {
    return NextResponse.json({ ok: false, message: "Shoe not found." }, { status: 404 });
  }

  let image;
  try {
    image = await sanitizeUploadedImage(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ ok: false, message: "That file could not be read as an image." }, { status: 400 });
  }

  // Unreviewed uploads stay private until an admin approves them.
  const bucket = PENDING_CORRECTIONS_BUCKET;
  const path = `${shoeId}/${Date.now()}-${randomUUID()}.${image.extension}`;

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, image.bytes, {
    upsert: false,
    contentType: image.contentType
  });
  if (uploadError) {
    console.error("[image-corrections] upload failed", uploadError.message);
    return NextResponse.json({ ok: false, message: "Upload failed. Please try again." }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("image_corrections").insert({
    shoe_id: shoeId,
    user_id: user.id,
    storage_bucket: bucket,
    storage_path: path,
    public_url: null,
    note: note || null,
    status: "pending"
  });

  if (insertError) {
    // Don't leave an orphaned object behind if the row insert failed.
    await supabase.storage.from(bucket).remove([path]);
    console.error("[image-corrections] insert failed", insertError.message);
    return NextResponse.json({ ok: false, message: "Could not save correction. Please try again." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Thanks! Your image was submitted for admin review."
  });
}
