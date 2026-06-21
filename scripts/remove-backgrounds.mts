// Local, one-time batch background remover for shoe images.
//
//   for each APPROVED shoe image: download the original from Supabase Storage →
//   run rembg locally to cut out the shoe (transparent PNG) → QA the alpha →
//   trim + pad to a centered square → upload the cut-out and make it the new
//   approved image (the old one is demoted to rejected, so it's reversible).
//
// This deliberately runs OFFLINE on your machine, NOT on the server. The old
// approach (PR #320) cut out backgrounds at render time with a per-tile WASM
// job and thrashed the main thread — it was reverted. Doing it once here means
// the site pays zero runtime cost: it just serves the already-transparent PNGs.
//
// Run from the repo root (so .env.local + node_modules resolve):
//   npx tsx scripts/remove-backgrounds.mts                 # DRY RUN, writes previews only
//   npx tsx scripts/remove-backgrounds.mts --slug <slug>   # one shoe (dry run)
//   npx tsx scripts/remove-backgrounds.mts --limit 5       # first 5 (dry run)
//   npx tsx scripts/remove-backgrounds.mts --apply         # really upload + swap
//   npx tsx scripts/remove-backgrounds.mts --apply --force # also redo ones already done
//
// Prereqs:
//   - rembg on PATH:   pip install "rembg[cli]" onnxruntime
//                      (first run downloads the model to ~/.u2net — be patient)
//   - sharp installed: npm install   (it's in devDependencies)
//   - .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
//     (the service-role client bypasses RLS). Optional: SUPABASE_STORAGE_BUCKET
//     (default "shoe-images") and REMBG_MODEL (default "u2net").
//
// Idempotent: processed images are tagged provider="rembg", so re-running skips
// them unless you pass --force. Reversible: history is kept in shoe_images.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "shoe-images";
const MODEL = process.env.REMBG_MODEL || "u2net";

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

// --- args --------------------------------------------------------------------
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const SLUG = flag("--slug");
const LIMIT = flag("--limit") ? Number(flag("--limit")) : undefined;
const SIZE = flag("--size") ? Number(flag("--size")) : 1000;

// Below these alpha-coverage bounds the cut-out is treated as a failure and is
// NOT uploaded: < 2% means rembg ate the whole shoe, > 98.5% means it removed
// nothing (no clear background to cut) — either way the original stays live.
const MIN_COVERAGE = 0.02;
const MAX_COVERAGE = 0.985;

// --- preflight: rembg + sharp ------------------------------------------------
try {
  execFileSync("rembg", ["--help"], { stdio: "ignore" });
} catch {
  throw new Error('rembg not found on PATH. Install it with:  pip install "rembg[cli]" onnxruntime');
}

let sharp: typeof import("sharp");
try {
  sharp = (await import("sharp")).default;
} catch {
  throw new Error("sharp not installed. Run `npm install` (it is in devDependencies).");
}

// --- workspace ---------------------------------------------------------------
// Intermediate downloads + rembg output go in a per-run RANDOM temp dir created
// with mkdtemp (0700, unpredictable name) so files in the shared os temp dir
// can't be pre-created/hijacked by another local user. Previews (the dry-run
// artifacts you inspect) live in a stable, gitignored dir at the repo root so
// they're easy to find and re-open.
const WORK = mkdtempSync(join(tmpdir(), "bgremove-"));
const IN_DIR = join(WORK, "in");
const OUT_DIR = join(WORK, "out");
const PREVIEW_DIR = join(process.cwd(), "bgremove-preview");
for (const d of [IN_DIR, OUT_DIR, PREVIEW_DIR]) mkdirSync(d, { recursive: true });

// --- types -------------------------------------------------------------------
type ApprovedImage = {
  id: string;
  shoe_id: string;
  storage_path: string;
  public_url: string;
  provider: string | null;
  created_by: string | null;
  shoes: { slug: string; brand: string; shoe_name: string } | null;
};

// --- helpers -----------------------------------------------------------------
async function fetchApprovedImages(): Promise<ApprovedImage[]> {
  const rows: ApprovedImage[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    let query = sb
      .from("shoe_images")
      .select("id, shoe_id, storage_path, public_url, provider, created_by, shoes!inner(slug, brand, shoe_name)")
      .eq("status", "approved")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (SLUG) query = query.eq("shoes.slug", SLUG);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as ApprovedImage[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

async function downloadOriginal(storagePath: string): Promise<Buffer> {
  const { data, error } = await sb.storage.from(BUCKET).download(storagePath);
  if (error || !data) throw new Error(`download failed: ${error?.message ?? "no data"}`);
  return Buffer.from(await data.arrayBuffer());
}

function runRembg(inputPath: string, outputPath: string) {
  // First invocation downloads the model — give it a generous timeout.
  execFileSync("rembg", ["i", "-m", MODEL, inputPath, outputPath], { stdio: "pipe", timeout: 300_000 });
}

async function alphaCoverage(png: Buffer): Promise<number> {
  const { data, info } = await sharp(png).ensureAlpha().resize(200, 200, { fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let opaque = 0;
  let total = 0;
  for (let i = 0; i < data.length; i += ch) {
    total += 1;
    if (data[i + ch - 1] > 24) opaque += 1;
  }
  return total ? opaque / total : 0;
}

// Scale the whole cut-out proportionally to fit a square canvas (contain = pad,
// never crop) and add an even transparent margin. No trim/extract step, so the
// shoe is never clipped — sharp's trim() can mis-detect the content box (e.g.
// when the shoe reaches the image edge) and slice a chunk off the shoe.
async function finalizePng(rawPng: Buffer): Promise<Buffer> {
  const margin = Math.round(SIZE * 0.06);
  const inner = SIZE - margin * 2;
  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  return sharp(rawPng)
    .ensureAlpha()
    .resize(inner, inner, { fit: "contain", background: transparent })
    .extend({ top: margin, bottom: margin, left: margin, right: margin, background: transparent })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function uploadAndSwap(row: ApprovedImage, png: Buffer) {
  const path = `shoes/${row.shoe_id}/${Date.now()}-${randomUUID()}-nobg.png`;
  const { error: uploadError } = await sb.storage.from(BUCKET).upload(path, png, { upsert: false, contentType: "image/png" });
  if (uploadError) throw new Error(`upload failed: ${uploadError.message}`);

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  const nowIso = new Date().toISOString();

  const { error: demoteError } = await sb
    .from("shoe_images")
    .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "Superseded by background-removed version." })
    .eq("shoe_id", row.shoe_id)
    .eq("status", "approved");
  if (demoteError) throw new Error(`demote failed: ${demoteError.message}`);

  const { error: insertError } = await sb.from("shoe_images").insert({
    shoe_id: row.shoe_id,
    storage_path: path,
    public_url: publicUrl,
    status: "approved",
    provider: "rembg",
    selection_reason: `Background removed locally via rembg (${MODEL})`,
    source_image_url: row.public_url,
    created_by: row.created_by ?? null,
    approved_at: nowIso
  });
  if (insertError) throw new Error(`insert failed: ${insertError.message}`);

  return publicUrl;
}

// --- run ---------------------------------------------------------------------
function label(row: ApprovedImage) {
  return row.shoes ? `${row.shoes.brand} ${row.shoes.shoe_name}`.trim() : row.shoe_id;
}

async function main() {
  console.log(`Mode: ${APPLY ? "APPLY (will upload + swap)" : "DRY RUN (previews only, nothing uploaded)"}`);
  console.log(`Bucket: ${BUCKET} | Model: ${MODEL} | Output: ${SIZE}px square${SLUG ? ` | slug=${SLUG}` : ""}\n`);

  let all = await fetchApprovedImages();
  if (!FORCE) all = all.filter((row) => row.provider !== "rembg");
  if (LIMIT) all = all.slice(0, LIMIT);

  if (!all.length) {
    console.log("Nothing to process (all approved images already background-removed, or no matches).");
    return;
  }

  const stats = { processed: 0, uploaded: 0, failedRemoval: 0, errored: 0 };

  for (const [i, row] of all.entries()) {
    const tag = `[${i + 1}/${all.length}] ${label(row)}`;
    const ext = extname(row.storage_path) || ".jpg";
    const inputPath = join(IN_DIR, `${row.id}${ext}`);
    const outputPath = join(OUT_DIR, `${row.id}.png`);

    try {
      const original = await downloadOriginal(row.storage_path);
      writeFileSync(inputPath, original);
      runRembg(inputPath, outputPath);
      const cut = readFileSync(outputPath);

      const coverage = await alphaCoverage(cut);
      if (coverage < MIN_COVERAGE || coverage > MAX_COVERAGE) {
        stats.failedRemoval += 1;
        console.log(`${tag} — SKIP (coverage ${(coverage * 100).toFixed(1)}% out of range, keeping original)`);
        continue;
      }

      const finalPng = await finalizePng(cut);
      stats.processed += 1;

      if (APPLY) {
        const url = await uploadAndSwap(row, finalPng);
        stats.uploaded += 1;
        console.log(`${tag} — OK (coverage ${(coverage * 100).toFixed(1)}%) → ${url}`);
      } else {
        const previewPath = join(PREVIEW_DIR, `${row.shoes?.slug ?? row.shoe_id}.png`);
        writeFileSync(previewPath, finalPng);
        console.log(`${tag} — OK (coverage ${(coverage * 100).toFixed(1)}%) → preview ${previewPath}`);
      }
    } catch (error) {
      stats.errored += 1;
      console.log(`${tag} — ERROR: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      try {
        rmSync(inputPath, { force: true });
        rmSync(outputPath, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Cut out OK:        ${stats.processed}`);
  console.log(`Uploaded + swapped:${stats.uploaded}${APPLY ? "" : "  (dry run — nothing uploaded)"}`);
  console.log(`Skipped (bad cut): ${stats.failedRemoval}`);
  console.log(`Errored:           ${stats.errored}`);
  if (!APPLY) console.log(`\nReview previews in ${PREVIEW_DIR}, then re-run with --apply to go live.`);
  else console.log(`\nDone. Trigger a redeploy (or wait for ISR) so the site picks up the new images.`);

  rmSync(WORK, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
