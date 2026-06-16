import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";

const schema = z.object({
  id: z.string().uuid("Invalid correction id."),
  action: z.enum(["approve", "reject"]),
  rejection_reason: z.string().max(500).optional()
});

// Admin acts on a user-submitted image correction. Approving promotes the
// uploaded file to the shoe's live image by inserting an `approved` row into
// `shoe_images` (demoting any previously approved image), mirroring the existing
// admin image-import approval flow.
export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const db = createAdminClient();
  if (!db) {
    return NextResponse.json({ ok: false, message: "Service role is not configured." }, { status: 500 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { data: correction, error: loadError } = await db
    .from("image_corrections")
    .select("*")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (loadError || !correction) {
    return NextResponse.json({ ok: false, message: "Correction not found." }, { status: 404 });
  }

  if (correction.status !== "pending") {
    return NextResponse.json({ ok: false, message: "This correction has already been handled." }, { status: 409 });
  }

  const nowIso = new Date().toISOString();

  if (parsed.data.action === "reject") {
    const { error } = await db
      .from("image_corrections")
      .update({
        status: "rejected",
        rejection_reason: parsed.data.rejection_reason ?? "Rejected by admin review.",
        reviewed_by: user.id,
        reviewed_at: nowIso
      })
      .eq("id", correction.id);

    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Correction rejected." });
  }

  // approve — demote the current approved image, then add the user's image as
  // the new approved one so it becomes live everywhere.
  const { error: demoteError } = await db
    .from("shoe_images")
    .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "Superseded by approved user image correction." })
    .eq("shoe_id", correction.shoe_id)
    .eq("status", "approved");

  if (demoteError) {
    return NextResponse.json({ ok: false, message: `Failed to demote previous image: ${demoteError.message}` }, { status: 500 });
  }

  const { error: insertError } = await db.from("shoe_images").insert({
    shoe_id: correction.shoe_id,
    storage_path: correction.storage_path,
    public_url: correction.public_url,
    status: "approved",
    provider: "user_correction",
    created_by: correction.user_id,
    approved_at: nowIso
  });

  if (insertError) {
    return NextResponse.json({ ok: false, message: `Failed to publish image: ${insertError.message}` }, { status: 500 });
  }

  const { error: markError } = await db
    .from("image_corrections")
    .update({ status: "approved", reviewed_by: user.id, reviewed_at: nowIso })
    .eq("id", correction.id);

  if (markError) {
    return NextResponse.json({ ok: false, message: markError.message }, { status: 400 });
  }

  revalidateTag("shoes");
  return NextResponse.json({ ok: true, message: "Image approved and applied to the shoe." });
}
