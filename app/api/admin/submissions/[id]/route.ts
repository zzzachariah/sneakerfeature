import { withPublicProfileNames } from "@/lib/admin/public-profile-names";
import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase } = auth;
  const { id } = await params;

  const submissionRes = await supabase
    .from("user_submissions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (submissionRes.error) return NextResponse.json({ ok: false, message: submissionRes.error.message }, { status: 400 });
  if (!submissionRes.data) return NextResponse.json({ ok: false, message: "Submission not found." }, { status: 404 });

  const [submission] = await withPublicProfileNames(supabase, [submissionRes.data], "user_id");

  // profiles.email is no longer readable via the anon/authenticated key
  // (migration 038 restricts the column to service-role). Fetch the submitter's
  // email through the service-role client and merge it back for the admin view.
  const submissionWithProfile = submission as {
    user_id?: string | null;
    profiles?: { username?: string; email?: string } | { username?: string; email?: string }[] | null;
  };
  const submitterId = submissionWithProfile.user_id;
  if (submitterId) {
    const serviceClient = createAdminClient();
    if (serviceClient) {
      const { data: emailRow } = await serviceClient
        .from("profiles")
        .select("email")
        .eq("id", submitterId)
        .maybeSingle();
      if (emailRow?.email) {
        const prof = Array.isArray(submissionWithProfile.profiles)
          ? submissionWithProfile.profiles[0]
          : submissionWithProfile.profiles;
        submissionWithProfile.profiles = { username: prof?.username, email: emailRow.email };
      }
    }
  }

  const [normalizedRes, draftRes, historyRes, publishedShoeRes, targetShoeRes] = await Promise.all([
    supabase.from("normalized_submission_results").select("*").eq("submission_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("submission_admin_versions").select("*").eq("submission_id", id).maybeSingle(),
    supabase
      .from("admin_audit_logs")
      .select("id, action, note, created_at, actor_admin_id")
      .eq("target_submission_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    submission.published_shoe_id
      ? supabase.from("shoes").select("id,slug,shoe_name,brand,is_published").eq("id", submission.published_shoe_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    submission.target_shoe_id
      ? supabase
          .from("shoes")
          .select("id,slug,shoe_name,brand,model_line,version_name,release_year,category,player,shoe_specs(*),shoe_stories(*)")
          .eq("id", submission.target_shoe_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  return NextResponse.json({
    ok: true,
    submission: {
      ...submission,
      shoes: publishedShoeRes.error ? null : publishedShoeRes.data,
      target_shoe: targetShoeRes.error ? null : targetShoeRes.data
    },
    normalized: normalizedRes.error ? null : normalizedRes.data,
    draft: draftRes.error ? null : draftRes.data,
    history: historyRes.error ? [] : await withPublicProfileNames(supabase, historyRes.data ?? [], "actor_admin_id")
  });
}
