// Phase 1 of the local blogger-review pipeline.
//
//   for each shoe: search Bilibili + YouTube via yt-dlp's built-in search
//   (bilisearch/ytsearch) → download subtitles (yt-dlp for YouTube, BBDown for
//   Bilibili) → upsert the ones that actually have a transcript to Supabase.
//
// Run from the repo root (so .env.local + node_modules resolve):
//   npx tsx scripts/blogger-reviews/ingest.mts            # every published shoe
//   npx tsx scripts/blogger-reviews/ingest.mts <slug>     # just one shoe (testing)
//
// Then run summarize.mts to fill pros/cons/summary via packyapi ("自动总结").
//
// Prereqs: yt-dlp + BBDown on PATH; .env.local with NEXT_PUBLIC_SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY. The service-role client bypasses RLS.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
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
const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const TMP_DIR = process.env.BLOGGER_REVIEWS_TMP_DIR || "/tmp/bloggerrev";
const MAX_PER_PLATFORM = 3; // keep up to 3 review cards per platform per shoe
const SEARCH_N = 6; // search hits to fetch per platform; we keep the first MAX_PER_PLATFORM that have a transcript
const CMD_TIMEOUT_MS = 180000;

// YouTube blocks unauthenticated yt-dlp ("confirm you're not a bot"); pass
// browser cookies to authenticate. Set ONE of these in .env.local (Bilibili via
// BBDown is unaffected):
//   YTDLP_COOKIES_FROM_BROWSER=firefox   (or chrome/safari/edge/brave)
//   YTDLP_COOKIES_FILE=/absolute/path/to/cookies.txt
const COOKIE_ARGS: string[] = (() => {
  const browser = process.env.YTDLP_COOKIES_FROM_BROWSER?.trim();
  if (browser) return ["--cookies-from-browser", browser];
  const file = process.env.YTDLP_COOKIES_FILE?.trim();
  if (file) return ["--cookies", file];
  return [];
})();

type Platform = "youtube" | "bilibili";
type Candidate = { platform: Platform; url: string };

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
  const out = run("yt-dlp", [...COOKIE_ARGS, "--skip-download", "--no-warnings", "--print", "%(uploader)s", url]);
  const name = out?.split("\n").map((s) => s.trim()).filter(Boolean)[0];
  return name && name !== "NA" ? name.slice(0, 80) : null;
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
      ...COOKIE_ARGS,
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
    // Bilibili subtitles are almost always AI-generated, and BBDown skips those
    // by default (--skip-ai defaults ON), so pass `--skip-ai false` explicitly.
    // If the video genuinely has no subtitles, nothing is written → null.
    run("BBDown", [url, "--sub-only", "--skip-ai", "false", "--work-dir", work]);
  }

  // Collect subtitle files recursively (BBDown may nest them in a per-video
  // subfolder); keep the largest = most complete track.
  const subPaths: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(srt|vtt)$/i.test(entry.name)) subPaths.push(full);
    }
  };
  if (existsSync(work)) walk(work);
  let best = "";
  for (const p of subPaths) {
    const text = subToText(readFileSync(p, "utf8"));
    if (text.length > best.length) best = text;
  }
  rmSync(work, { recursive: true, force: true });
  return best || null;
}

// Find candidate review videos via yt-dlp's built-in search extractors
// (bilisearch / ytsearch) — purpose-built for finding videos, unlike a general
// web search. Bilibili first (primary source for a Chinese audience).
function findCandidates(brand: string, name: string): Candidate[] {
  const searches: { platform: Platform; query: string }[] = [
    { platform: "bilibili", query: `bilisearch${SEARCH_N}:${brand} ${name} 篮球鞋 测评` },
    { platform: "youtube", query: `ytsearch${SEARCH_N}:${brand} ${name} basketball review` }
  ];
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const { platform, query } of searches) {
    const raw = run("yt-dlp", [...COOKIE_ARGS, "--flat-playlist", "--no-warnings", "--print", "%(url)s", query]);
    if (!raw) continue;
    for (const line of raw.split("\n").map((s) => s.trim()).filter(Boolean)) {
      if (classify(line) !== platform) continue;
      const id = videoId(line);
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ platform, url: line });
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
    const candidates = findCandidates(shoe.brand, shoe.shoe_name);
    if (!candidates.length) {
      console.log("    no videos found in search");
      continue;
    }
    // Keep up to MAX_PER_PLATFORM videos *per platform* (so the UI can offer a
    // YouTube/Bilibili toggle with up to 3 cards each).
    const kept: Record<Platform, number> = { youtube: 0, bilibili: 0 };
    for (const c of candidates) {
      if (kept.youtube >= MAX_PER_PLATFORM && kept.bilibili >= MAX_PER_PLATFORM) break;
      if (kept[c.platform] >= MAX_PER_PLATFORM) continue;
      const transcript = downloadSubtitles(c.url, c.platform);
      if (!transcript) {
        console.log(`    ✗ no subtitle, skip: ${c.url}`);
        continue;
      }
      const blogger = uploaderViaYtDlp(c.url) ?? (c.platform === "youtube" ? "YouTube 博主" : "B站 UP主");
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
      if (upErr) {
        console.warn(`    upsert failed: ${upErr.message}`);
      } else {
        console.log(`    ✓ ${c.platform} "${blogger}" — ${transcript.length} chars`);
        kept[c.platform] += 1;
        upserted += 1;
      }
    }
    if (kept.youtube + kept.bilibili === 0) console.log("    (no videos had subtitles — nothing kept)");
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
