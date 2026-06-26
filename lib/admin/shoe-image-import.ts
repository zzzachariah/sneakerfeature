import { randomUUID } from "crypto";
import dns from "dns/promises";
import { isIP } from "net";
import { SupabaseClient } from "@supabase/supabase-js";

type SourceType = "official" | "retailer" | "review_media" | "unknown";

type SerpApiConfig = {
  provider: string;
  apiKey: string;
  engine: string;
  baseUrl: string;
};

type SerpApiImageResult = {
  original?: string;
  title?: string;
  source?: string;
  link?: string;
  original_width?: number;
  original_height?: number;
};

type ImportMode = "single_pending" | "bulk_auto_approve";

type ImportBestImageInput = {
  supabase: SupabaseClient;
  adminStorageClient: SupabaseClient;
  shoe: { id: string; brand: string; shoe_name: string; release_year?: number | null };
  mode: ImportMode;
  createdBy: string;
  bucket?: string;
  supabaseUrl: string;
};

type ImportBestImageSuccess = {
  ok: true;
  storagePath: string;
  publicUrl: string;
  status: "pending" | "approved";
  sourceImageUrl: string;
  sourceDomain: string;
  sourceType: SourceType;
  selectionReason: string;
  queryUsed: string;
};

type ImportBestImageFailure = {
  ok: false;
  error: "No suitable image found" | "Selected image could not be downloaded" | "Image import upload failed" | "Image metadata insert failed";
  detail?: string;
};

export type ImportBestImageResult = ImportBestImageSuccess | ImportBestImageFailure;

const DEFAULT_SERP_BASE_URL = "https://serpapi.com/search.json";
export const MIN_IMAGE_BYTES = 14_000;
const MAX_CANDIDATE_ATTEMPTS = 8;

const OFFICIAL_DOMAINS = ["nike.com", "adidas.com", "underarmour.com", "newbalance.com", "puma.com", "anta.com", "lining.com", "wayofwade.com", "asics.com", "jordan.com"];
const RETAILER_DOMAINS = ["footlocker.com", "champssports.com", "finishline.com", "dickssportinggoods.com", "eastbay.com", "goat.com", "stockx.com", "zappos.com", "scheels.com", "kickscrew.com", "ssense.com"];
const REVIEW_MEDIA_DOMAINS = ["weartesters.com", "solecollector.com", "sneakernews.com", "highsnobiety.com"];
const BLOCKED_DOMAINS = ["pinterest.com", "pinimg.com", "facebook.com", "instagram.com", "twitter.com", "x.com"];

const STRONG_POSITIVE_TERMS = ["official", "picture", "product", "retailer", "shoe"];
const STRONG_NEGATIVE_TERMS = ["thumbnail", "sprite", "proxy", "logo", "icon", "top 10", "ranking"];
const STOPWORDS = new Set(["the", "and", "for", "with", "shoe", "shoes", "model", "official", "picture", "image"]);

function isPrivateIp(ip: string): boolean {
  // IPv6 loopback and ULA (fc00::/7)
  if (ip === "::1") return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  // IPv4 private/loopback/link-local ranges
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

async function isPrivateOrLoopbackUrl(urlStr: string): Promise<boolean> {
  let hostname: string;
  try {
    hostname = new URL(urlStr).hostname;
  } catch {
    return true; // invalid URL — treat as blocked
  }
  // If the hostname is already a raw IP, check it directly
  if (isIP(hostname)) return isPrivateIp(hostname);
  // Otherwise resolve DNS and check the returned address
  try {
    const { address } = await dns.lookup(hostname, { all: false });
    return isPrivateIp(address);
  } catch {
    return true; // DNS failure — treat as blocked
  }
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((part) => part.trim())
    .filter((part) => part.length >= 2)
    .filter((part) => !STOPWORDS.has(part));
}

function parseDomain(urlValue?: string) {
  if (!urlValue) return "";
  try {
    return new URL(urlValue).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function domainMatches(domain: string, candidates: string[]) {
  return candidates.some((candidate) => domain === candidate || domain.endsWith(`.${candidate}`));
}

function isLikelyDirectImageUrl(url: string) {
  return /\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(url);
}

function classifySourceType(domain: string): SourceType {
  if (!domain) return "unknown";
  if (domainMatches(domain, OFFICIAL_DOMAINS)) return "official";
  if (domainMatches(domain, RETAILER_DOMAINS)) return "retailer";
  if (domainMatches(domain, REVIEW_MEDIA_DOMAINS)) return "review_media";
  return "unknown";
}

export function getSerpApiConfig(): SerpApiConfig | null {
  const provider = process.env.SERP_API_PROVIDER;
  const apiKey = process.env.SERP_API_KEY;
  const engine = process.env.SERP_API_ENGINE;
  const baseUrl = process.env.SERP_API_BASE_URL ?? DEFAULT_SERP_BASE_URL;
  if (!provider || !apiKey || !engine) return null;
  return { provider, apiKey, engine, baseUrl };
}

function buildSearchQueries(brand: string, shoeName: string) {
  const core = `${brand} ${shoeName}`.replace(/\s+/g, " ").trim();
  return [`${core} official picture`];
}

type ScoredCandidate = {
  imageUrl: string;
  title: string;
  sourcePageUrl: string;
  sourceDomain: string;
  sourceType: SourceType;
  score: number;
  isHighResolution: boolean;
};

function scoreCandidates({ brand, shoeName, results }: { brand: string; shoeName: string; results: SerpApiImageResult[] }): ScoredCandidate[] {
  const brandTokens = tokens(brand);
  const shoeTokens = tokens(shoeName);
  const shoeNumberTokens = shoeTokens.filter((token) => /^\d+[a-z]*$/.test(token));

  const scored: ScoredCandidate[] = [];

  for (const result of results) {
    const imageUrl = result.original?.trim() || "";
    if (!imageUrl) continue;

    const sourcePageUrl = result.link?.trim() || "";
    const sourceDomain = parseDomain(sourcePageUrl || imageUrl);
    if (!sourceDomain || domainMatches(sourceDomain, BLOCKED_DOMAINS)) continue;

    const title = result.title?.trim() || "";
    const sourceText = result.source?.trim() || "";
    const width = result.original_width ?? 0;
    const height = result.original_height ?? 0;

    const haystack = normalizeText(`${title} ${sourceText} ${sourcePageUrl} ${imageUrl}`);
    const sourceType = classifySourceType(sourceDomain);

    if (shoeNumberTokens.some((token) => !haystack.includes(token))) continue;

    const matchedShoeTokens = shoeTokens.filter((token) => haystack.includes(token));
    const matchedBrandTokens = brandTokens.filter((token) => haystack.includes(token));

    if (shoeTokens.length > 0 && matchedShoeTokens.length < Math.max(1, Math.ceil(shoeTokens.length * 0.45))) continue;
    if (brandTokens.length > 0 && matchedBrandTokens.length === 0) continue;

    const lowerTitle = title.toLowerCase();
    let score = 0;

    score += matchedShoeTokens.length * 11;
    score += matchedBrandTokens.length * 9;

    if (sourceType === "official") score += 44;
    else if (sourceType === "retailer") score += 34;
    else if (sourceType === "review_media") score += 18;

    const positiveHits = STRONG_POSITIVE_TERMS.filter((term) => lowerTitle.includes(term));
    const negativeHits = STRONG_NEGATIVE_TERMS.filter((term) => lowerTitle.includes(term));
    score += positiveHits.length * 6;
    score -= negativeHits.length * 8;

    if (isLikelyDirectImageUrl(imageUrl)) score += 24;
    if (/cdn|images|media|img/i.test(imageUrl)) score += 6;
    if (/thumbnail|thumb|sprite|proxy/i.test(imageUrl)) score -= 12;

    const isHighResolution = width >= 1000 && height >= 600;
    if (isHighResolution) score += 8;

    scored.push({ imageUrl, title, sourcePageUrl, sourceDomain, sourceType, score, isHighResolution });
  }

  return scored.sort((a, b) => b.score - a.score);
}

function buildSelectionReason(candidate: ScoredCandidate) {
  const sourcePrefix =
    candidate.sourceType === "official"
      ? "official"
      : candidate.sourceType === "retailer"
        ? "retailer"
        : candidate.sourceType === "review_media"
          ? "review"
          : "unknown-source";

  if (candidate.isHighResolution) {
    return `${sourcePrefix} image with exact model match and strong downloadability`;
  }
  return `${sourcePrefix} image with exact model match and successful download`;
}

async function searchCandidates(config: SerpApiConfig, query: string): Promise<SerpApiImageResult[]> {
  const url = new URL(config.baseUrl);
  url.searchParams.set("engine", config.engine);
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", config.apiKey);
  url.searchParams.set("num", "20");

  const response = await fetch(url.toString(), { method: "GET" });
  const text = await response.text();
  if (!response.ok) throw new Error(`serpapi_status=${response.status} body=${text.slice(0, 300)}`);
  const payload = JSON.parse(text) as { images_results?: SerpApiImageResult[] };
  return Array.isArray(payload.images_results) ? payload.images_results : [];
}

export function getDownloadHeaders(url: string, sourcePageUrl: string) {
  const referer = sourcePageUrl || `${new URL(url).origin}/`;
  return {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    referer
  };
}

export function looksLikeHtml(buffer: Buffer) {
  const sample = buffer.toString("utf8", 0, Math.min(buffer.length, 512)).toLowerCase();
  return sample.includes("<html") || sample.includes("<!doctype html") || sample.includes("<head") || sample.includes("<body");
}

async function probeCandidate(candidate: ScoredCandidate) {
  try {
    if (await isPrivateOrLoopbackUrl(candidate.imageUrl)) {
      return { ok: false as const, reason: "probe_blocked_private_ip" };
    }

    const head = await fetch(candidate.imageUrl, {
      method: "HEAD",
      redirect: "error",
      headers: getDownloadHeaders(candidate.imageUrl, candidate.sourcePageUrl),
      signal: AbortSignal.timeout(12_000)
    });

    if (!head.ok) return { ok: false as const, reason: `probe_head_status_${head.status}` };

    const ct = (head.headers.get("content-type") ?? "").toLowerCase();
    if (ct.startsWith("image/")) return { ok: true as const, reason: "probe_head_image_ok" };

    if (await isPrivateOrLoopbackUrl(candidate.imageUrl)) {
      return { ok: false as const, reason: "probe_blocked_private_ip" };
    }

    const partial = await fetch(candidate.imageUrl, {
      method: "GET",
      redirect: "error",
      headers: { ...getDownloadHeaders(candidate.imageUrl, candidate.sourcePageUrl), range: "bytes=0-2047" },
      signal: AbortSignal.timeout(12_000)
    });

    if (!partial.ok) return { ok: false as const, reason: `probe_get_status_${partial.status}` };

    const partialCt = (partial.headers.get("content-type") ?? "").toLowerCase();
    const bytes = Buffer.from(await partial.arrayBuffer());
    if (!partialCt.startsWith("image/")) return { ok: false as const, reason: `probe_non_image_content_type_${partialCt || "unknown"}` };
    if (looksLikeHtml(bytes)) return { ok: false as const, reason: "probe_html_payload" };

    return { ok: true as const, reason: "probe_get_image_ok" };
  } catch (error) {
    return { ok: false as const, reason: `probe_exception_${error instanceof Error ? error.message : "unknown"}` };
  }
}

async function downloadCandidate(candidate: ScoredCandidate) {
  try {
    if (await isPrivateOrLoopbackUrl(candidate.imageUrl)) {
      return { ok: false as const, reason: "download_blocked_private_ip" };
    }

    const response = await fetch(candidate.imageUrl, {
      method: "GET",
      redirect: "error",
      headers: getDownloadHeaders(candidate.imageUrl, candidate.sourcePageUrl),
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) return { ok: false as const, reason: `download_status_${response.status}` };

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) return { ok: false as const, reason: `download_non_image_content_type_${contentType || "unknown"}` };

    const imageBytes = Buffer.from(await response.arrayBuffer());
    if (looksLikeHtml(imageBytes)) return { ok: false as const, reason: "download_html_payload" };
    if (imageBytes.byteLength < MIN_IMAGE_BYTES) return { ok: false as const, reason: `download_image_too_small_${imageBytes.byteLength}` };

    return { ok: true as const, imageBytes, contentType };
  } catch (error) {
    return { ok: false as const, reason: `download_exception_${error instanceof Error ? error.message : "unknown"}` };
  }
}

export async function importBestShoeImage(input: ImportBestImageInput): Promise<ImportBestImageResult> {
  const config = getSerpApiConfig();
  if (!config) return { ok: false, error: "No suitable image found", detail: "serp_api_config_missing" };

  const queries = buildSearchQueries(input.shoe.brand, input.shoe.shoe_name);
  const uniqueResults: SerpApiImageResult[] = [];
  const seen = new Set<string>();

  for (const query of queries) {
    const queryResults = await searchCandidates(config, query);
    for (const result of queryResults) {
      const key = result.original?.trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      uniqueResults.push(result);
    }
  }

  const ranked = scoreCandidates({ brand: input.shoe.brand, shoeName: input.shoe.shoe_name, results: uniqueResults });
  if (!ranked.length) return { ok: false, error: "No suitable image found" };

  const attempts: string[] = [];
  let selectedCandidate: ScoredCandidate | null = null;
  let selectedDownload: { imageBytes: Buffer; contentType: string } | null = null;

  for (const candidate of ranked.slice(0, MAX_CANDIDATE_ATTEMPTS)) {
    const probe = await probeCandidate(candidate);
    if (!probe.ok) {
      attempts.push(`${candidate.sourceDomain}|${probe.reason}`);
      continue;
    }

    const download = await downloadCandidate(candidate);
    if (!download.ok) {
      attempts.push(`${candidate.sourceDomain}|${download.reason}`);
      continue;
    }

    selectedCandidate = candidate;
    selectedDownload = { imageBytes: download.imageBytes, contentType: download.contentType };
    break;
  }

  if (!selectedCandidate || !selectedDownload) {
    return { ok: false, error: "Selected image could not be downloaded", detail: attempts.length ? attempts.join("; ").slice(0, 1800) : "no_viable_candidate_download" };
  }

  const extension = selectedDownload.contentType.includes("png") ? "png" : selectedDownload.contentType.includes("webp") ? "webp" : "jpg";
  const bucket = input.bucket ?? "shoe-images";
  const path = `shoes/${input.shoe.id}/${Date.now()}-${randomUUID()}.${extension}`;

  const { error: uploadError } = await input.adminStorageClient.storage.from(bucket).upload(path, selectedDownload.imageBytes, {
    upsert: false,
    contentType: selectedDownload.contentType
  });
  if (uploadError) return { ok: false, error: "Image import upload failed", detail: uploadError.message };

  const status = input.mode === "bulk_auto_approve" ? "approved" : "pending";
  const nowIso = new Date().toISOString();
  const publicUrl = `${input.supabaseUrl}/storage/v1/object/public/${bucket}/${path}`;
  const selectionReason = buildSelectionReason(selectedCandidate);

  if (status === "pending") {
    const { error: closePendingError } = await input.supabase
      .from("shoe_images")
      .update({ status: "rejected", rejected_at: nowIso, rejection_reason: "Superseded by newer pending import." })
      .eq("shoe_id", input.shoe.id)
      .eq("status", "pending");
    if (closePendingError) return { ok: false, error: "Image metadata insert failed", detail: closePendingError.message };
  }

  const { error: insertError } = await input.supabase.from("shoe_images").insert({
    shoe_id: input.shoe.id,
    storage_path: path,
    public_url: publicUrl,
    status,
    provider: "SerpApi",
    search_provider: "SerpApi",
    search_model: config.engine,
    source_image_url: selectedCandidate.imageUrl,
    source_domain: selectedCandidate.sourceDomain || null,
    source_type: selectedCandidate.sourceType,
    selection_reason: selectionReason,
    created_by: input.createdBy,
    approved_at: status === "approved" ? nowIso : null
  });

  if (insertError) return { ok: false, error: "Image metadata insert failed", detail: insertError.message };

  return {
    ok: true,
    storagePath: path,
    publicUrl,
    status,
    sourceImageUrl: selectedCandidate.imageUrl,
    sourceDomain: selectedCandidate.sourceDomain,
    sourceType: selectedCandidate.sourceType,
    selectionReason,
    queryUsed: queries[0]
  };
}

export type DownloadImageFromUrlResult =
  | { ok: true; imageBytes: Buffer; contentType: string }
  | { ok: false; reason: string };

export async function downloadImageFromUrl(url: string): Promise<DownloadImageFromUrlResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: `unsupported_protocol_${parsed.protocol}` };
  }

  try {
    const { address } = await dns.lookup(parsed.hostname);
    if (isPrivateIp(address)) {
      return { ok: false, reason: "ssrf_blocked_private_ip" };
    }
  } catch {
    return { ok: false, reason: "ssrf_dns_resolution_failed" };
  }

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "error",
      headers: getDownloadHeaders(url, `${parsed.origin}/`),
      signal: AbortSignal.timeout(20_000)
    });

    if (!response.ok) return { ok: false, reason: `download_status_${response.status}` };

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("image/")) {
      return { ok: false, reason: `download_non_image_content_type_${contentType || "unknown"}` };
    }

    const imageBytes = Buffer.from(await response.arrayBuffer());
    if (looksLikeHtml(imageBytes)) return { ok: false, reason: "download_html_payload" };
    if (imageBytes.byteLength < MIN_IMAGE_BYTES) {
      return { ok: false, reason: `download_image_too_small_${imageBytes.byteLength}` };
    }

    return { ok: true, imageBytes, contentType };
  } catch (error) {
    return { ok: false, reason: `download_exception_${error instanceof Error ? error.message : "unknown"}` };
  }
}
