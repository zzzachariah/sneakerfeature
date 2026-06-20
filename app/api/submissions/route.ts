import { NextResponse } from "next/server";
import { normalizeSubmission } from "@/lib/openai-normalize";
import { submissionSchema } from "@/lib/validation/schemas";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function jsonResponse(payload: unknown, init?: ResponseInit) {
  console.log("[submissions] final returned response", {
    status: init?.status ?? 200,
    payload
  });
  return NextResponse.json(payload, init);
}

export async function POST(request: Request) {
  console.log("[submissions] submit request start");
  const normalizationEnabled = process.env.ENABLE_OPENAI_NORMALIZATION === "true";
  console.log("[submissions] normalization enabled", { normalizationEnabled });

  try {
    let body: unknown;
    try {
      body = await request.json();
      console.log("[submissions] request body parsed", {
        bodyKeys: body && typeof body === "object" ? Object.keys(body) : []
      });
    } catch (error) {
      console.error("[submissions] request body parse failed", error);
      return jsonResponse({ ok: false, message: "Invalid JSON request body." }, { status: 400 });
    }

    const parsed = submissionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResponse({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid submission payload." }, { status: 400 });
    }

    let originalSnapshot: unknown = null;
    if (parsed.data.original_snapshot) {
      try {
        originalSnapshot = JSON.parse(parsed.data.original_snapshot);
      } catch {
        return jsonResponse({ ok: false, message: "Invalid original snapshot payload." }, { status: 400 });
      }
    }

    const rawPayload = {
      shoe_name: parsed.data.shoe_name,
      brand: parsed.data.brand,
      model: parsed.data.model,
      release_year: parsed.data.release_year,
      forefoot_midsole_tech: parsed.data.forefoot_midsole_tech,
      heel_midsole_tech: parsed.data.heel_midsole_tech,
      outsole_tech: parsed.data.outsole_tech,
      upper_tech: parsed.data.upper_tech,
      cushioning_feel: parsed.data.cushioning_feel,
      court_feel: parsed.data.court_feel,
      bounce: parsed.data.bounce,
      stability: parsed.data.stability,
      traction: parsed.data.traction,
      fit: parsed.data.fit,
      tags: parsed.data.tags,
      story_title: parsed.data.story_title,
      story_notes: parsed.data.story_notes,
      raw_text: parsed.data.raw_text,
      source_links: parsed.data.source_links
    };

    const verified = await verifyTurnstileToken(parsed.data.verificationToken);
    console.log("[submissions] human verification result", verified);
    if (!verified.success) return jsonResponse({ ok: false, message: verified.message }, { status: 400 });

    const serverClient = await createClient();
    if (!serverClient) {
      return jsonResponse({ ok: false, message: "Database client is not configured." }, { status: 500 });
    }

    const {
      data: { user },
      error: userError
    } = await serverClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ ok: false, message: "Authentication required to submit." }, { status: 401 });
    }

    const supabase = createAdminClient();
    if (!supabase) {
      return jsonResponse({ ok: false, message: "Admin database client is not configured." }, { status: 500 });
    }

    console.log("[submissions] DB insert start");
    const { data: submission, error } = await supabase
      .from("user_submissions")
      .insert({
        user_id: user.id,
        submission_type: parsed.data.submission_type ?? "new_shoe",
        target_shoe_id: parsed.data.target_shoe_id ?? null,
        original_snapshot: originalSnapshot,
        raw_payload: rawPayload,
        raw_text: parsed.data.raw_text,
        source_links: (parsed.data.source_links ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        status: "pending"
      })
      .select("id")
      .single();
    console.log("[submissions] DB insert end", {
      insertedId: submission?.id ?? null,
      hasError: Boolean(error)
    });

    if (error || !submission) {
      return jsonResponse({ ok: false, message: error?.message ?? "Failed to store submission." }, { status: 500 });
    }

    if (!normalizationEnabled) {
      console.log("[submissions] bypass path used", { submissionId: submission.id });
      return jsonResponse({
        ok: true,
        message: "Submission received. Automatic normalization is currently disabled, so it was saved for manual review.",
        normalization: "disabled"
      });
    }

    console.log("[submissions] OpenAI path used", { submissionId: submission.id });
    console.log("[submissions] normalization start");
    try {
      const normalized = await normalizeSubmission(rawPayload);
      console.log("[submissions] normalization end", {
        hasNormalizedPayload: Boolean(normalized.normalized)
      });

      if (!normalized.normalized) {
        return jsonResponse({
          ok: true,
          message: "Submission saved for manual review. Automatic normalization did not return structured output.",
          normalization: "failed"
        });
      }

      const { error: normalizedInsertError } = await supabase.from("normalized_submission_results").insert({
        submission_id: submission.id,
        normalized_payload: normalized.normalized,
        confidence_score: normalized.confidence_score,
        processing_notes: normalized.processing_notes
      });

      if (normalizedInsertError) {
        console.error("[submissions] normalized result insert failed", normalizedInsertError);
        return jsonResponse({
          ok: true,
          message: "Submission saved, but normalization output could not be stored. It was kept for manual review.",
          normalization: "failed"
        });
      }

      const { error: statusUpdateError } = await supabase.from("user_submissions").update({ status: "normalized" }).eq("id", submission.id);
      if (statusUpdateError) {
        console.error("[submissions] submission status update failed", statusUpdateError);
        return jsonResponse({
          ok: true,
          message: "Submission saved, but normalization status update failed. It remains pending manual review.",
          normalization: "failed"
        });
      }

      return jsonResponse({ ok: true, message: "Submission queued for review.", normalized, normalization: "completed" });
    } catch (normalizationError) {
      console.error("[submissions] normalization error", normalizationError);
      return jsonResponse({
        ok: true,
        message: "Submission saved. Automatic normalization failed, so it was kept for manual review.",
        normalization: "failed"
      });
    }
  } catch (error) {
    console.error("[submissions] caught error", error);
    return jsonResponse({ ok: false, message: "Unexpected error while processing submission." }, { status: 500 });
  }
}
