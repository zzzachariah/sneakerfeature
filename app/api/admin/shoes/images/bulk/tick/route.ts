import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { requireAdminApi } from "@/lib/admin/route-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeBulkImageStats, processBulkJobTick } from "@/lib/admin/bulk-image-jobs";
import { getSerpApiConfig } from "@/lib/admin/shoe-image-import";

export async function POST() {
  const auth = await requireAdminApi();
  if ("error" in auth) return auth.error;

  const { supabase, user } = auth;
  const adminClient = createAdminClient();

  if (!adminClient) {
    return NextResponse.json({ ok: false, error: "Supabase service role key is not configured." }, { status: 500 });
  }

  const config = getSerpApiConfig();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!config || !supabaseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Search/import environment variables are incomplete.",
        detail: `SERP_API_PROVIDER=${Boolean(process.env.SERP_API_PROVIDER)} SERP_API_KEY=${Boolean(process.env.SERP_API_KEY)} SERP_API_ENGINE=${Boolean(process.env.SERP_API_ENGINE)} supabaseUrl=${Boolean(supabaseUrl)}`
      },
      { status: 500 }
    );
  }

  try {
    const tick = await processBulkJobTick({
      supabase,
      adminStorageClient: adminClient,
      supabaseUrl,
      bucket: process.env.SUPABASE_STORAGE_BUCKET ?? "shoe-images",
      userId: user.id
    });
    const stats = await computeBulkImageStats(supabase);

    revalidateTag("shoes");
    return NextResponse.json({ ok: true, ...tick, stats });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: "Failed to process bulk image job tick.", detail: error instanceof Error ? error.message : "unknown_error" },
      { status: 500 }
    );
  }
}
