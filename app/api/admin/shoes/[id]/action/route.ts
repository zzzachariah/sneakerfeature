import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";

const nullableString = z.string().nullable().optional();

const schema = z.object({
  action: z.enum(["update", "unpublish", "publish"]),
  note: z.string().optional(),
  shoe: z
    .object({
      slug: z.string().min(1).optional(),
      brand: z.string().min(1),
      shoe_name: z.string().min(1),
      model_line: nullableString,
      version_name: nullableString,
      release_year: z.coerce.number().nullable().optional(),
      category: nullableString,
      player: nullableString,
      price: z.coerce.number().nullable().optional(),
      weight: nullableString,
      is_published: z.boolean().optional()
    })
    .optional(),
  spec: z
    .object({
      forefoot_midsole_tech: nullableString,
      heel_midsole_tech: nullableString,
      outsole_tech: nullableString,
      upper_tech: nullableString,
      cushioning_feel: nullableString,
      court_feel: nullableString,
      bounce: nullableString,
      stability: nullableString,
      traction: nullableString,
      fit: nullableString,
      containment: nullableString,
      support: nullableString,
      torsional_rigidity: nullableString,
      playstyle_summary: nullableString,
      story_summary: nullableString,
      tags: z.array(z.string()).optional()
    })
    .optional(),
  story: z
    .object({
      title: z.string().min(1),
      content: z.string().min(1),
      source_label: nullableString,
      source_url: nullableString
    })
    .optional()
});

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase, user } = auth;
  const { id } = await params;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload.");

  const { data: currentShoe, error: currentShoeError } = await supabase.from("shoes").select("*").eq("id", id).maybeSingle();
  if (currentShoeError || !currentShoe) return NextResponse.json({ ok: false, message: "Shoe not found." }, { status: 404 });

  if (parsed.data.action === "unpublish") {
    const { error: shoeUpdateError } = await supabase.from("shoes").update({ is_published: false, unpublished_at: new Date().toISOString(), unpublished_by: user.id }).eq("id", id);
    if (shoeUpdateError) return badRequest(shoeUpdateError.message);

    const { error: logError } = await supabase.from("admin_audit_logs").insert({
      actor_admin_id: user.id,
      target_type: "shoe",
      target_shoe_id: id,
      action: "unpublished",
      note: parsed.data.note ?? "Record unpublished",
      before_payload: currentShoe
    });
    if (logError) return badRequest(logError.message);

    const { error: submissionUpdateError } = await supabase.from("user_submissions").update({ status: "unpublished" }).eq("published_shoe_id", id);
    if (submissionUpdateError) return badRequest(submissionUpdateError.message);

    revalidateTag("shoes");
    return NextResponse.json({ ok: true, message: "Record unpublished." });
  }

  if (parsed.data.action === "publish") {
    const { error: shoeUpdateError } = await supabase.from("shoes").update({ is_published: true, unpublished_at: null, unpublished_by: null }).eq("id", id);
    if (shoeUpdateError) return badRequest(shoeUpdateError.message);

    const { error: logError } = await supabase.from("admin_audit_logs").insert({
      actor_admin_id: user.id,
      target_type: "shoe",
      target_shoe_id: id,
      action: "published",
      note: parsed.data.note ?? "Record republished",
      before_payload: currentShoe
    });
    if (logError) return badRequest(logError.message);

    const { error: submissionUpdateError } = await supabase.from("user_submissions").update({ status: "published" }).eq("published_shoe_id", id);
    if (submissionUpdateError) return badRequest(submissionUpdateError.message);

    revalidateTag("shoes");
    return NextResponse.json({ ok: true, message: "Record published." });
  }

  if (!parsed.data.shoe) {
    return badRequest("shoe payload is required for update.");
  }

  const nowIso = new Date().toISOString();

  const { error: shoeUpdateError } = await supabase
    .from("shoes")
    .update({ ...parsed.data.shoe, updated_at: nowIso })
    .eq("id", id);
  if (shoeUpdateError) return badRequest(shoeUpdateError.message);

  if (parsed.data.spec) {
    const specPayload = { ...parsed.data.spec, updated_at: nowIso };
    const { data: updatedSpecs, error: specUpdateError } = await supabase.from("shoe_specs").update(specPayload).eq("shoe_id", id).select("id");
    if (specUpdateError) return badRequest(specUpdateError.message);

    if (!updatedSpecs || updatedSpecs.length === 0) {
      const { error: specInsertError } = await supabase.from("shoe_specs").insert({ shoe_id: id, ...specPayload });
      if (specInsertError) return badRequest(specInsertError.message);
    }
  }

  if (parsed.data.story) {
    const { data: updatedStories, error: storyUpdateError } = await supabase
      .from("shoe_stories")
      .update(parsed.data.story)
      .eq("shoe_id", id)
      .select("id");
    if (storyUpdateError) return badRequest(storyUpdateError.message);

    if (!updatedStories || updatedStories.length === 0) {
      const { error: storyInsertError } = await supabase.from("shoe_stories").insert({ shoe_id: id, ...parsed.data.story });
      if (storyInsertError) return badRequest(storyInsertError.message);
    }
  }

  const { error: auditInsertError } = await supabase.from("admin_audit_logs").insert({
    actor_admin_id: user.id,
    target_type: "shoe",
    target_shoe_id: id,
    action: "updated",
    note: parsed.data.note ?? "Published record updated",
    before_payload: currentShoe,
    after_payload: { ...parsed.data.shoe, spec: parsed.data.spec ?? null, story: parsed.data.story ?? null }
  });
  if (auditInsertError) return badRequest(auditInsertError.message);

  revalidateTag("shoes");
  return NextResponse.json({ ok: true, message: "Record updated." });
}
