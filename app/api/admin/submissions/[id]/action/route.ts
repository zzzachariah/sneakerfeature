import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPackyClient } from "@/lib/ai/packy-client";
import { autoTranslateShoe } from "@/lib/admin/translation-jobs";

const finalSchema = z.object({
  shoe_name: z.string().min(1),
  brand: z.string().min(1),
  model_line: z.string().optional(),
  version_name: z.string().optional(),
  release_year: z.coerce.number().optional(),
  category: z.string().optional(),
  player: z.string().optional(),
  forefoot_midsole_tech: z.string().optional(),
  heel_midsole_tech: z.string().optional(),
  outsole_tech: z.string().optional(),
  upper_tech: z.string().optional(),
  cushioning_feel: z.string().optional(),
  court_feel: z.string().optional(),
  bounce: z.string().optional(),
  stability: z.string().optional(),
  traction: z.string().optional(),
  fit: z.string().optional(),
  playstyle_summary: z.string().optional(),
  story_title: z.string().optional(),
  story_summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  source_links: z.array(z.string()).optional(),
  raw_text: z.string().optional(),
  reviewer_notes: z.string().optional()
});

const bodySchema = z.object({
  action: z.enum(["save_draft", "approve_publish", "reject"]),
  finalPayload: finalSchema.optional(),
  note: z.string().optional()
});

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { user } = auth;

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, message: "Supabase admin client is not configured." },
      { status: 500 }
    );
  }

  const { id } = await params;
  const payload = bodySchema.safeParse(await request.json());
  if (!payload.success) {
    return badRequest(payload.error.issues[0]?.message ?? "Invalid payload.");
  }

  const { data: currentSubmission, error: submissionError } = await supabase
    .from("user_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (submissionError || !currentSubmission) {
    return NextResponse.json(
      { ok: false, message: "Submission not found." },
      { status: 404 }
    );
  }

  if (payload.data.action === "reject") {
    const { error: deleteError } = await supabase
      .from("user_submissions")
      .delete()
      .eq("id", id);

    if (deleteError) return badRequest(deleteError.message);

    return NextResponse.json({ ok: true, message: "Submission deleted." });
  }

  if (!payload.data.finalPayload) {
    return badRequest("Final payload is required for this action.");
  }

  const { error: draftVersionError } = await supabase.from("submission_admin_versions").upsert(
    {
      submission_id: id,
      final_payload: payload.data.finalPayload,
      last_edited_by: user.id,
      updated_at: new Date().toISOString()
    },
    { onConflict: "submission_id" }
  );

  if (draftVersionError) return badRequest(draftVersionError.message);

  if (payload.data.action === "save_draft") {
    const { error: draftUpdateError } = await supabase
      .from("user_submissions")
      .update({
        status: "draft",
        reviewed_by: user.id,
        reviewer_notes: payload.data.note ?? null
      })
      .eq("id", id);

    if (draftUpdateError) return badRequest(draftUpdateError.message);

    const { error: draftLogError } = await supabase
      .from("admin_audit_logs")
      .insert({
        actor_admin_id: user.id,
        target_type: "submission",
        target_submission_id: id,
        action: "draft_saved",
        note: payload.data.note ?? "Draft saved",
        after_payload: payload.data.finalPayload
      });

    if (draftLogError) return badRequest(draftLogError.message);

    return NextResponse.json({ ok: true, message: "Draft saved." });
  }

  const final = payload.data.finalPayload;
  const nowIso = new Date().toISOString();
  const storyContent =
    final.story_summary ??
    final.playstyle_summary ??
    `${final.brand} ${final.shoe_name}`;
  const isCorrection = currentSubmission.submission_type === "correction";

  let shoeId = (isCorrection
    ? currentSubmission.target_shoe_id
    : currentSubmission.published_shoe_id) as string | null;
  let beforeShoePayload: unknown = null;

  if (!shoeId && isCorrection) {
    return badRequest("Correction submissions must target an existing published shoe.");
  }

  if (!shoeId) {
    const baseSlug = slugify(`${final.brand}-${final.shoe_name}`);
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;

    const { data: insertedShoe, error: insertError } = await supabase
      .from("shoes")
      .insert({
        slug,
        brand: final.brand,
        shoe_name: final.shoe_name,
        model_line: final.model_line ?? null,
        version_name: final.version_name ?? null,
        release_year: final.release_year ?? null,
        category: final.category ?? null,
        player: final.player ?? null,
        created_by: user.id,
        is_published: true
      })
      .select("id")
      .single();

    if (insertError || !insertedShoe) {
      return badRequest(insertError?.message ?? "Could not publish shoe.");
    }

    shoeId = insertedShoe.id;
  } else {
    const { data: currentShoe, error: loadShoeError } = await supabase
      .from("shoes")
      .select("*")
      .eq("id", shoeId)
      .maybeSingle();

    if (loadShoeError || !currentShoe) {
      return badRequest(loadShoeError?.message ?? "Published shoe record is missing.");
    }

    beforeShoePayload = currentShoe;

    const { data: updatedRows, error: shoeUpdateError } = await supabase
      .from("shoes")
      .update({
        brand: final.brand,
        shoe_name: final.shoe_name,
        model_line: final.model_line ?? null,
        version_name: final.version_name ?? null,
        release_year: final.release_year ?? null,
        category: final.category ?? null,
        player: final.player ?? null,
        is_published: true,
        unpublished_at: null,
        unpublished_by: null,
        updated_at: nowIso
      })
      .eq("id", shoeId)
      .select("id");

    if (shoeUpdateError || !updatedRows || updatedRows.length === 0) {
      return badRequest(
        shoeUpdateError?.message ?? "Could not update published shoe."
      );
    }
  }

  const specPayload = {
    forefoot_midsole_tech: final.forefoot_midsole_tech ?? null,
    heel_midsole_tech: final.heel_midsole_tech ?? null,
    outsole_tech: final.outsole_tech ?? null,
    upper_tech: final.upper_tech ?? null,
    cushioning_feel: final.cushioning_feel ?? null,
    court_feel: final.court_feel ?? null,
    bounce: final.bounce ?? null,
    stability: final.stability ?? null,
    traction: final.traction ?? null,
    fit: final.fit ?? null,
    playstyle_summary: final.playstyle_summary ?? null,
    story_summary: final.story_summary ?? null,
    tags: final.tags ?? [],
    updated_at: nowIso
  };

  const { data: updatedSpecs, error: specUpdateError } = await supabase
    .from("shoe_specs")
    .update(specPayload)
    .eq("shoe_id", shoeId)
    .select("id");

  if (specUpdateError) return badRequest(specUpdateError.message);

  if (!updatedSpecs || updatedSpecs.length === 0) {
    const { error: specInsertError } = await supabase
      .from("shoe_specs")
      .insert({ shoe_id: shoeId, ...specPayload });

    if (specInsertError) return badRequest(specInsertError.message);
  }

  const storyTitle = final.story_title?.trim() || `${final.brand} ${final.shoe_name}`;

  const { data: updatedStories, error: storyUpdateError } = await supabase
    .from("shoe_stories")
    .update({
      title: storyTitle,
      content: storyContent,
      source_label: "Admin approved submission",
      source_url: final.source_links?.[0] ?? null
    })
    .eq("shoe_id", shoeId)
    .select("id");

  if (storyUpdateError) return badRequest(storyUpdateError.message);

  if (!updatedStories || updatedStories.length === 0) {
    const { error: storyInsertError } = await supabase
      .from("shoe_stories")
      .insert({
        shoe_id: shoeId,
        title: storyTitle,
        content: storyContent,
        source_label: "Admin approved submission",
        source_url: final.source_links?.[0] ?? null
      });

    if (storyInsertError) return badRequest(storyInsertError.message);
  }

  // Pre-translate the newly published/updated content into the *_zh columns so
  // the Chinese UI has it immediately. Best-effort: never blocks/fails publish.
  if (shoeId) {
    await autoTranslateShoe(supabase, createPackyClient(), shoeId, { force: true });
  }

  if (final.source_links && final.source_links.length > 0) {
    const { error: sourceInsertError } = await supabase
      .from("sources")
      .insert(
        final.source_links.map((url) => ({
          shoe_id: shoeId,
          source_type: "submission",
          source_label: "Admin approved submission source",
          source_url: url
        }))
      );

    if (sourceInsertError) return badRequest(sourceInsertError.message);
  }

  const { data: updatedRows, error: submissionUpdateError } = await supabase
    .from("user_submissions")
    .update({
      status: "approved",
      reviewed_by: user.id,
      reviewer_notes: payload.data.note ?? null,
      published_shoe_id: shoeId,
      published_at: nowIso
    })
    .eq("id", id)
    .select("id, status, published_at, published_shoe_id, reviewed_by");

  console.log("[publish] submission metadata update result", {
    submissionId: id,
    shoeId,
    reviewerId: user.id,
    nowIso,
    submissionUpdateError,
    updatedRows,
    updatedRowCount: updatedRows?.length ?? 0
  });

  if (submissionUpdateError) {
    return badRequest(
      `submission update failed: ${submissionUpdateError.message}`
    );
  }

  const updatedSubmission = updatedRows?.[0] ?? null;

  if (
    !updatedSubmission ||
    updatedSubmission.status !== "approved" ||
    !updatedSubmission.published_at ||
    updatedSubmission.published_shoe_id !== shoeId ||
    updatedSubmission.reviewed_by !== user.id
  ) {
    return badRequest(
      "Failed to persist submission publish metadata after production writes."
    );
  }

  const { error: publishLogError } = await supabase
    .from("admin_audit_logs")
    .insert({
      actor_admin_id: user.id,
      target_type: isCorrection || currentSubmission.published_shoe_id ? "shoe" : "submission",
      target_submission_id: id,
      target_shoe_id: shoeId,
      action: currentSubmission.published_shoe_id
        ? "updated"
        : isCorrection
          ? "correction_approved"
          : "approved_published",
      note:
        payload.data.note ??
        (isCorrection
          ? "Correction approved and existing published record updated"
          : currentSubmission.published_shoe_id
          ? "Published record updated"
          : "Submission approved and published"),
      before_payload: beforeShoePayload ?? currentSubmission.raw_payload,
      after_payload: final
    });

  if (publishLogError) return badRequest(publishLogError.message);

  return NextResponse.json({
    ok: true,
    message: isCorrection
      ? "Correction approved and existing shoe updated."
      : currentSubmission.published_shoe_id
        ? "Published record updated."
        : "Published to official shoes table.",
    shoeId
  });
}
