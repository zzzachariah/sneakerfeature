// Phase 1 of the local blogger-review pipeline.
//
//   find 3 review video links per shoe (Bocha) → download subtitles
//   (yt-dlp for YouTube, BBDown for Bilibili) → upsert pending rows to Supabase.
//
// Run from the repo root (so .env.local + node_modules resolve):
//   npx tsx scripts/blogger-reviews/ingest.mts            # every published shoe
//   npx tsx scripts/blogger-reviews/ingest.mts <slug>     # just one shoe (testing)
//
// Then run summarize.mts to fill pros/cons/summary via packyapi ("自动总结").
//
// Prereqs: yt-dlp + BBDown on PATH; .env.local with NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, BOCHA_API_KEY. The service-role client bypasses RLS.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { bochaWebSearch, type WebSearchHit } from "../../lib/ai/web-search";

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

const TMP_DIR = process.env.BLOGGER_REVIEWS_TMP_DIR || "/tmp/bloggerrev";
const MAX_PER_SHOE = 3;
const CMD_TIMEOUT_MS = 180000;

type Platform = "youtube" | "bilibili";
type Candidate = { platform: Platform; url: string; hit: WebSearchHit };

// Only accept real single-video pages; drop blogs, channel roots, shorts, brand
// pages, search pages, etc.
function classify(url: string): Platform | null {
  if (/youtube\.com\/watch\?v=|youtu\.be\//i.test(url)) return "youtube";
  if (/bilibili\.com\/video\/(BV|av)/i.test(url)) return "bilibili";
  return null;
}

// Canonical id for dedupe across queries.
function videoId(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{6,})/i);
  if (yt) return `yt_${yt[1]}`;
  const bili = url.match(/bilibili\.com\/video\/(BV[\w]+|av\d+)/i);
  if (bili) return `bili_${bili[1].toLowerCase()}`;
  return url.replace(/[^a-z0-9]/gi, "_").slice(0, 64);
}

function run(cmd: string, args: string[]): string | null {
  try {
    return execFileSync(cmd, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: CMD_TIMEOUT_MS
    });
  } catch {
    return null;
  }
}

// yt-dlp resolves the uploader/channel for both YouTube AND Bilibili — the most
// reliable blogger-name source (search-result titles are noisy).
function uploaderViaYtDlp(url: string): string | null {
  const out = run("yt-dlp", ["--skip-download", "--no-warnings", "--print", "%(uploader)s", url]);
  const name = out?.split("\n").map((s) => s.trim()).filter(Boolean)[0];
  return name && name !== "NA" ? name.slice(0, 80) : null;
}

// Last-resort blogger name from the Bocha hit when yt-dlp metadata isn't available.
function bloggerFromHit(hit: WebSearchHit, platform: Platform): string {
  if (hit.siteName && !/bilibili|哔哩哔哩|youtube/i.test(hit.siteName)) return hit.siteName.trim().slice(0, 80);
  const parts = hit.title.split(/[|｜\-–—_·]/).map((s) => s.trim()).filter(Boolean);
  const candidate = parts.find((s) => !/youtube|bilibili|哔哩哔哩|b站|官网/i.test(s) && s.length <= 40);
  if (candidate) return candidate.slice(0, 80);
  return platform === "youtube" ? "YouTube 博主" : "B站 UP主";
}

// SRT/VTT → one clean line of text.
function subToText(content: string): string {
  return content
    .replace(/\r/g, "")
    .replace(/^WEBVTT.*$/gm, "")
    .replace(/^\d+\s*$/gm, "") // srt cue indices
    .replace(/^[\d:.,]+\s*-->.*$/gm, "") // timestamps
    .replace(/<[^>]+>/g, "") // inline tags
    .replace(/\{[^}]*\}/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(align|position):/i.test(l))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function downloadSubtitles(url: string, platform: Platform): string | null {
  const work = join(TMP_DIR, videoId(url));
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });

  if (platform === "youtube") {
    run("yt-dlp", [
      "--skip-download",
      "--no-warnings",
      "--write-subs",
      "--write-auto-subs",
      "--sub-langs",
      "zh-Hans,zh,zh-CN,en.*",
      "--sub-format",
      "vtt/srt/best",
      "--convert-subs",
      "srt",
      "-o",
      join(work, "%(id)s.%(ext)s"),
      url
    ]);
  } else {
    // BBDown writes subtitle .srt into the work dir; many Bilibili videos have
    // no CC, in which case nothing is written and we return null.
    run("BBDown", [url, "--sub-only", "--work-dir", work]);
  }

  const files = existsSync(work) ? readdirSync(work).filter((f) => /\.(srt|vtt)$/i.test(f)) : [];
  let best = "";
  for (const f of files) {
    const text = subToText(readFileSync(join(work, f), "utf8"));
    if (text.length > best.length) best = text; // largest = most complete track
  }
  rmSync(work, { recursive: true, force: true });
  return best || null;
}

async function findCandidates(brand: string, name: string): Promise<Candidate[]> {
  const queries = [
    `${brand} ${name} 篮球鞋 实战测评`,
    `${brand} ${name} 测评 bilibili`,
    `${brand} ${name} basketball review youtube`
  ];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const q of queries) {
    const res = await bochaWebSearch(q, { count: 3, timeoutMs: 8000 });
    if (!res.ok) {
      console.warn(`    bocha "${q}" → ${res.error}`);
      continue;
    }
    for (const hit of res.results) {
      const platform = classify(hit.url);
      if (!platform) continue;
      const id = videoId(hit.url);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ platform, url: hit.url, hit });
      if (out.length >= MAX_PER_SHOE) return out;
    }
  }
  return out;
}

async function main() {
  const slug = process.argv[2];
  let query = sb.from("shoes").select("id, slug, brand, shoe_name").eq("is_published", true);
  if (slug) query = query.eq("slug", slug);
  const { data: shoes, error } = await query;
  if (error) throw error;
  if (!shoes?.length) {
    console.log(slug ? `No published shoe with slug "${slug}".` : "No published shoes found.");
    return;
  }

  console.log(`Ingesting blogger reviews for ${shoes.length} shoe(s)…`);
  let upserted = 0;
  for (const shoe of shoes) {
    console.log(`\n● ${shoe.brand} ${shoe.shoe_name} (${shoe.slug})`);
    const candidates = await findCandidates(shoe.brand, shoe.shoe_name);
    if (!candidates.length) {
      console.log("    no video links found");
      continue;
    }
    for (const c of candidates) {
      console.log(`    ${c.platform}: ${c.url}`);
      const blogger = uploaderViaYtDlp(c.url) ?? bloggerFromHit(c.hit, c.platform);
      const transcript = downloadSubtitles(c.url, c.platform);
      console.log(`      blogger="${blogger}" transcript=${transcript ? `${transcript.length} chars` : "none"}`);
      const { error: upErr } = await sb.from("blogger_reviews").upsert(
        {
          shoe_id: shoe.id,
          blogger_name: blogger,
          platform: c.platform,
          video_url: c.url,
          transcript,
          status: "pending",
          is_published: false,
          source_label: c.platform === "youtube" ? "YouTube" : "Bilibili"
        },
        { onConflict: "shoe_id,video_url", ignoreDuplicates: true }
      );
      if (upErr) console.warn(`      upsert failed: ${upErr.message}`);
      else upserted += 1;
    }
  }
  console.log(
    `\nDone. Upserted ${upserted} row(s) as status=pending.\n` +
      `Next: npx tsx scripts/blogger-reviews/summarize.mts`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
