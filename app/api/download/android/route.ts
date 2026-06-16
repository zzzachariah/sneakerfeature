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
const GITHUB_REPO = "zzzachariah/sneakerfeature";
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
      next: { revalidate: 3600 },
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
        if (apk?.browser_download_url) return apk.browser_download_url as string;
      }
    }
  } catch {
    /* fall through to the static latest link */
  }
  return APK_FALLBACK_URL;
}

export async function GET() {
  const apkUrl = await resolveApkUrl();

  // Stream the body straight through (no buffering) so large APKs aren't capped
  // by the serverless response-body limit — same approach as image-proxy.
  const upstream = await fetch(apkUrl, {
    headers: { Accept: "application/vnd.android.package-archive" },
    redirect: "follow",
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "apk unavailable", status: upstream.status }, { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": 'attachment; filename="sneakerfeature.apk"',
    // Let Vercel's CDN cache the binary; it only changes when a new release ships.
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
  });
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);

  return new NextResponse(upstream.body, { status: 200, headers });
}
