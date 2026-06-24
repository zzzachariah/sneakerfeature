// Direct CDN-side image sizing for Supabase public storage URLs. Going via
// the `/storage/v1/render/image/public/...?width=…&quality=…` endpoint lets
// the CDN serve a right-sized (and webp-encoded) variant, so thumbnails stop
// downloading the full-resolution background-removed PNG.
//
// Returned URL hits Supabase directly — NOT our `/api/image-proxy` — so this
// never adds a Vercel hop, and the export-card path (which keeps using
// `proxiedImageSrc`) is unaffected.
const SUPA_OBJECT = "/storage/v1/object/public/";
const SUPA_RENDER = "/storage/v1/render/image/public/";

// DPR-aware buckets. Picking a small set keeps Supabase's CDN cache hot —
// one variant per logical container size serves both 1x and 2x screens.
const WIDTH_BUCKETS = [128, 192, 256, 384, 512, 768, 960, 1280, 1600] as const;

function pickWidthBucket(width: number): number {
  const target = Math.ceil(width * 2);
  for (const b of WIDTH_BUCKETS) if (b >= target) return b;
  return WIDTH_BUCKETS[WIDTH_BUCKETS.length - 1];
}

export function sizedImageSrc(
  src: string | null | undefined,
  width?: number,
  quality = 75
): string {
  if (!src) return "";
  const trimmed = src.trim();
  if (!trimmed) return "";
  if (!width || width <= 0) return trimmed;
  if (trimmed.startsWith("/") || trimmed.startsWith("data:") || trimmed.startsWith("blob:")) {
    return trimmed;
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }
  // Only rewrite Supabase storage URLs — every other origin is returned as-is
  // so external sources (and already-rendered URLs) pass through unchanged.
  if (!url.pathname.includes(SUPA_OBJECT)) return trimmed;
  url.pathname = url.pathname.replace(SUPA_OBJECT, SUPA_RENDER);
  url.searchParams.set("width", String(pickWidthBucket(width)));
  url.searchParams.set("quality", String(quality));
  return url.toString();
}
