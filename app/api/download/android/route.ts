import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Streams the latest Android APK from GitHub Releases through our own domain.
// GitHub's release CDN (objects.githubusercontent.com) is blocked/throttled in
// mainland China, so a direct link there just hangs on a blank page. This server
// (on Vercel, outside the GFW) can reach GitHub fine, and clients download from
// snkrfeature.com — which is reachable in China. The /download page links here
// only as a fallback: clients that can reach GitHub download from it directly.
//
// No user input is accepted (the source is hard-coded to this repo's releases),
// so there is no SSRF surface — mirrors app/api/image-proxy/route.ts.
const GITHUB_REPO = process.env.GITHUB_REPO ?? "zzzachariah/sneakerfeature";
const APK_FALLBACK_URL = `https://github.com/${GITHUB_REPO}/releases/latest/download/sneakerfeature.apk`;

// Resolve the newest mobile-v* release's .apk so a later desktop release can't
// shadow "latest". Cached for an hour to spare the unauthenticated GitHub API.
async function resolveApkUrl(): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "sneakerfeature-download-proxy",
      },
      next: { revalidate: 300 },
    });
    if (res.ok) {
      const releases = await res.json();
      if (Array.isArray(releases)) {
        const mobile = releases.find(
          (r) =>
            r &&
            !r.draft &&
            !r.prerelease &&
            typeof r.tag_name === "string" &&
            r.tag_name.startsWith("mobile-v")
        );
        const apk = mobile?.assets?.find(
          (a: { name?: string }) => typeof a?.name === "string" && a.name.endsWith(".apk")
        );
        if (apk?.browser_download_url) {
          const raw = apk.browser_download_url as string;
          try {
            const parsed = new URL(raw);
            if (
              parsed.hostname === "github.com" ||
              parsed.hostname.endsWith(".github.com") ||
              parsed.hostname.endsWith(".githubusercontent.com")
            ) {
              return raw;
            }
          } catch {
            /* invalid URL — fall through */
          }
        }
      }
    }
  } catch {
    /* fall through to the static latest link */
  }
  return APK_FALLBACK_URL;
}

export async function GET() {
  const apkUrl = await resolveApkUrl();

  // Redirect to the versioned asset URL instead of streaming the binary.
  // This sidesteps CDN staleness entirely — the binary URL itself changes when
  // a new release ships, so CDN caches are automatically busted by URL.
  // The short TTL (300 s) ensures a new release is visible within minutes.
  return NextResponse.redirect(apkUrl, {
    status: 302,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
