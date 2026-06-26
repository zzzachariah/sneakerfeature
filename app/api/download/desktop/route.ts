import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Returns the latest desktop release asset URLs (macOS .dmg, Windows .exe) and
// version string. Keeping the GitHub repo identifier server-side means the
// client bundle never needs to know the repo path.
const GITHUB_REPO = process.env.GITHUB_REPO ?? "zzzachariah/sneakerfeature";

type DesktopRelease = {
  macUrl: string;
  winUrl: string;
  version: string;
} | null;

async function resolveDesktopRelease(): Promise<DesktopRelease> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "sneakerfeature-download-proxy",
        },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return null;
    const releases = await res.json();
    if (!Array.isArray(releases)) return null;
    const desk = releases.find(
      (r) =>
        r &&
        !r.draft &&
        !r.prerelease &&
        typeof r.tag_name === "string" &&
        r.tag_name.startsWith("desktop-v")
    );
    if (!desk) return null;
    const dmg = desk.assets?.find(
      (a: { name?: string }) => typeof a?.name === "string" && a.name.endsWith(".dmg")
    );
    const exe = desk.assets?.find(
      (a: { name?: string }) => typeof a?.name === "string" && a.name.endsWith(".exe")
    );
    if (!dmg?.browser_download_url && !exe?.browser_download_url) return null;
    return {
      macUrl: dmg?.browser_download_url ?? "",
      winUrl: exe?.browser_download_url ?? "",
      version: desk.tag_name.replace(/^desktop-v/, ""),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const release = await resolveDesktopRelease();
  return NextResponse.json(release, {
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
