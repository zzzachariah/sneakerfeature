// Phase 2 of the local blogger-review pipeline ("上传之后自动总结").
//
//   read pending rows with a transcript → summarize via packyapi (same channel
//   as shoe recommendation) → write pros/cons/summary (Chinese + English) and
//   publish (status=ready, is_published=true).
//
// Run from the repo root, right after ingest.mts:
//   npx tsx scripts/blogger-reviews/summarize.mts
//
// Prereqs: .env.local with NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
// PACKYAPI_API_KEY, PACKYAPI_BASE_URL.

import { createClient } from "@supabase/supabase-js";
import { createPackyClient } from "../../lib/ai/packy-client";
import { summarizeBloggerReview } from "../../lib/ai/summarize-review";

// --- env + clients (standalone tsx does NOT auto-load .env like Next) ---------
const loadEnvFile = (process as unknown as { loadEnvFile?: (path?: string) => void }).loadEnvFile;
for (const file of [".env.local", ".env"]) {
  try {
    loadEnvFile?.(file);
  } catch {
    /* file missing — ignore */
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local, and run from the repo root."
  );
}
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const packy = createPackyClient();
if (!packy) {
  throw new Error(
    "packyapi not configured — set PACKYAPI_API_KEY and PACKYAPI_BASE_URL in .env.local (same vars the website uses)."
  );
}

async function main() {
  // Process not-yet-summarized rows AND previously errored ones, so re-running
  // this script simply retries failures (no manual status reset needed).
  const { data: rows, error } = await sb
    .from("blogger_reviews")
    .select("id, shoe_id, blogger_name, transcript")
    .in("status", ["pending", "error"])
    .not("transcript", "is", null);
  if (error) throw error;
  if (!rows?.length) {
    console.log("No pending/errored rows with a transcript. (Run ingest.mts first.)");
    return;
  }

  console.log(`Summarizing ${rows.length} row(s)…`);
  const shoeNames = new Map<string, string>();
  let ready = 0;
  let errored = 0;

  for (const row of rows) {
    let shoeName = shoeNames.get(row.shoe_id);
    if (shoeName === undefined) {
      const { data: shoe } = await sb.from("shoes").select("shoe_name").eq("id", row.shoe_id).maybeSingle();
      shoeName = shoe?.shoe_name ?? "";
      shoeNames.set(row.shoe_id, shoeName);
    }

    try {
      const s = await summarizeBloggerReview(packy, {
        shoeName,
        bloggerName: row.blogger_name,
        transcript: row.transcript as string
      });
      const { error: upErr } = await sb
        .from("blogger_reviews")
        .update({
          pros: s.pros,
          cons: s.cons,
          summary: s.summary,
          pros_en: s.pros_en,
          cons_en: s.cons_en,
          summary_en: s.summary_en,
          status: "ready",
          is_published: true,
          error_detail: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", row.id);
      if (upErr) {
        console.warn(`  ✗ ${shoeName} — ${row.blogger_name}: ${upErr.message}`);
        errored += 1;
      } else {
        console.log(`  ✓ ${shoeName} — ${row.blogger_name}`);
        ready += 1;
      }
    } catch (e) {
      const detail = e instanceof Error ? e.message.slice(0, 600) : String(e);
      await sb
        .from("blogger_reviews")
        .update({ status: "error", error_detail: detail, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      console.warn(`  ✗ ${shoeName} — ${row.blogger_name}: ${detail}`);
      errored += 1;
    }
  }

  console.log(`\nDone. ${ready} ready (published), ${errored} errored. Open a shoe page to see the 博主点评 band.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
