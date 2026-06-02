import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdminApi } from "@/lib/admin/route-auth";
import {
  createPackyClient,
  describePackyError,
  describePackyEnvProblem,
  getPackyEnvReport
} from "@/lib/ai/packy-client";
import { summarizeBloggerReview } from "@/lib/ai/summarize-review";

// Needs the OpenAI SDK for the resummarize action.
export const runtime = "nodejs";

const schema = z.object({ action: z.enum(["publish", "unpublish", "resummarize"]) });

function badRequest(message: string) {
  return NextResponse.json({ ok: false, message }, { status: 400 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;
  const { supabase } = auth;
  const { id } = await params;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Invalid payload.");
  const { action } = parsed.data;

  if (action === "publish" || action === "unpublish") {
    const { error } = await supabase
      .from("blogger_reviews")
      .update({ is_published: action === "publish", updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return badRequest(error.message);
    revalidateTag("blogger_reviews");
    return NextResponse.json({ ok: true, message: action === "publish" ? "Published." : "Unpublished." });
  }

  // resummarize — re-run packyapi on the stored transcript (server-side, same
  // shared lib the local script uses). Sets status=ready but does NOT auto-publish.
  const { data: row, error: rowErr } = await supabase
    .from("blogger_reviews")
    .select("id, shoe_id, blogger_name, transcript")
    .eq("id", id)
    .maybeSingle();
  if (rowErr || !row) return NextResponse.json({ ok: false, message: "Review not found." }, { status: 404 });
  if (!row.transcript) {
    return badRequest("No stored transcript to re-summarize. Re-run the ingest script for this video.");
  }

  const client = createPackyClient();
  if (!client) {
    return NextResponse.json({ ok: false, message: describePackyEnvProblem(getPackyEnvReport()) }, { status: 503 });
  }

  const { data: shoe } = await supabase.from("shoes").select("shoe_name").eq("id", row.shoe_id).maybeSingle();

  try {
    const s = await summarizeBloggerReview(client, {
      shoeName: shoe?.shoe_name ?? "",
      bloggerName: row.blogger_name,
      transcript: row.transcript
    });
    const { error: upErr } = await supabase
      .from("blogger_reviews")
      .update({
        pros: s.pros,
        cons: s.cons,
        summary: s.summary,
        pros_en: s.pros_en,
        cons_en: s.cons_en,
        summary_en: s.summary_en,
        status: "ready",
        error_detail: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", id);
    if (upErr) return badRequest(upErr.message);
    revalidateTag("blogger_reviews");
    return NextResponse.json({ ok: true, message: "Re-summarized.", summary: s });
  } catch (e) {
    const detail = describePackyError(e);
    await supabase
      .from("blogger_reviews")
      .update({ status: "error", error_detail: detail, updated_at: new Date().toISOString() })
      .eq("id", id);
    return NextResponse.json({ ok: false, message: detail }, { status: 502 });
  }
}
