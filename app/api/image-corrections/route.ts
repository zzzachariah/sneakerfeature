import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json({ ok: false, message: "Supabase URL is not configured." }, { status: 500 });
  }

  const { data: shoe } = await supabase.from("shoes").select("id").eq("id", shoeId).maybeSingle();
  if (!shoe) {
    return NextResponse.json({ ok: false, message: "Shoe not found." }, { status: 404 });
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "shoe-images";
  const extension = ALLOWED[file.type];
  const path = `corrections/${shoeId}/${Date.now()}-${randomUUID()}.${extension}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
    upsert: false,
    contentType: file.type
  });
  if (uploadError) {
    return NextResponse.json({ ok: false, message: `Upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;

  const { error: insertError } = await supabase.from("image_corrections").insert({
    shoe_id: shoeId,
    user_id: user.id,
    storage_path: path,
    public_url: publicUrl,
    note: note || null,
    status: "pending"
  });

  if (insertError) {
    // Don't leave an orphaned object behind if the row insert failed.
    await supabase.storage.from(bucket).remove([path]);
    return NextResponse.json({ ok: false, message: `Could not save correction: ${insertError.message}` }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: "Thanks! Your image was submitted for admin review."
  });
}
