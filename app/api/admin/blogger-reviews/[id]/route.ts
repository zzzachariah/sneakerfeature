import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";

// Free-text edits to a review. Does NOT touch status (use the action route to
// re-summarize / publish). Arrays are trimmed and capped to 2 to keep the
// two-good-two-bad contract.
const patchSchema = z.object({
  blogger_name: z.string().min(1).max(120).optional(),
  video_url: z.string().url().max(500).optional(),
  source_label: z.string().max(60).nullable().optional(),
  summary: z.string().max(400).nullable().optional(),
  summary_en: z.string().max(400).nullable().optional(),
  pros: z.array(z.string().max(200)).max(4).optional(),
  cons: z.array(z.string().max(200)).max(4).optional(),
  pros_en: z.array(z.string().max(200)).max(4).optional(),
  cons_en: z.array(z.string().max(200)).max(4).optional()
});

const TEXT_FIELDS = ["blogger_name", "video_url", "source_label", "summary", "summary_en"] as const;
const ARRAY_FIELDS = ["pros", "cons", "pros_en", "cons_en"] as const;

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload.");
  const updates = parsed.data;

  const payload: Record<string, unknown> = {};
  for (const k of TEXT_FIELDS) {
    if (updates[k] !== undefined) payload[k] = updates[k];
  }
  for (const k of ARRAY_FIELDS) {
    const v = updates[k];
    if (v !== undefined) payload[k] = v.map((s) => s.trim()).filter(Boolean).slice(0, 2);
  }
  if (Object.keys(payload).length === 0) return badRequest("No fields to update.");
  payload.updated_at = new Date().toISOString();

  const { error } = await supabase.from("blogger_reviews").update(payload).eq("id", id);
  if (error) return badRequest(error.message);

  revalidateTag("blogger_reviews");
  return NextResponse.json({ ok: true, message: "Saved." });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const { error } = await supabase.from("blogger_reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 400 });

  revalidateTag("blogger_reviews");
  return NextResponse.json({ ok: true, message: "Deleted." });
}
