import { safeCount } from "./server-contract";

const PROJECT_ID = "prj_fKFAsXiLsf2avMpOqjKjC0ili15S";
const TEAM_ID = "team_YXU6Q9GVndYBNQnFRo221v5l";
const DAY_MS = 86_400_000;
const CACHE_MS = 60_000;

export type WallPopularity = {
  viewsBySlug: ReadonlyMap<string, number>;
  status: "live" | "stale" | "unavailable";
  asOf: string | null;
};

/** Only aggregate public detail-page counts; never return visitor identifiers. */
export function createWallPopularityReader({
  getToken = () => process.env.VERCEL_ANALYTICS_TOKEN,
  fetcher = (...args) => fetch(...args),
  now = Date.now
}: { getToken?: () => string | undefined; fetcher?: typeof fetch; now?: () => number } = {}) {
  let cache: { value: WallPopularity; expires: number } | null = null;
  let pending: Promise<WallPopularity> | null = null;
  const unavailable = (): WallPopularity => cache?.value.viewsBySlug.size
    ? { ...cache.value, status: "stale" }
    : { viewsBySlug: new Map(), status: "unavailable", asOf: null };

  return async (): Promise<WallPopularity> => {
    const token = getToken()?.trim();
    if (!token) return unavailable();
    if (cache && cache.expires > now()) return cache.value;
    if (pending) return pending;
    pending = (async () => {
      const today = Math.floor(now() / DAY_MS) * DAY_MS;
      const url = new URL("https://api.vercel.com/v1/query/web-analytics/visits/aggregate");
      url.searchParams.set("projectId", PROJECT_ID);
      url.searchParams.set("teamId", TEAM_ID);
      url.searchParams.set("by", "requestPath");
      url.searchParams.set("filter", "startswith(requestPath, '/shoes/')");
      url.searchParams.set("limit", "100");
      // Thirty UTC calendar days, including today. Vercel rounds date bounds;
      // using tomorrow avoids dropping the current day's traffic.
      url.searchParams.set("since", new Date(today - 29 * DAY_MS).toISOString());
      url.searchParams.set("until", new Date(today + DAY_MS).toISOString());
      try {
        const response = await fetcher(url, {
          headers: { Authorization: `Bearer ${token}` }, cache: "no-store",
          signal: AbortSignal.timeout(3500)
        });
        if (!response.ok) throw new Error("analytics unavailable");
        const body = await response.json() as { data?: { requestPath?: unknown; pageviews?: unknown }[] };
        if (!Array.isArray(body.data)) throw new Error("invalid analytics report");
        const viewsBySlug = new Map<string, number>();
        for (const row of body.data) {
          if (typeof row?.requestPath !== "string") continue;
          const match = /^\/shoes\/([^/?#]+)\/?$/.exec(row.requestPath);
          const views = safeCount(row.pageviews);
          if (!match || views === null || views === 0) continue;
          let slug: string;
          try { slug = decodeURIComponent(match[1]); } catch { continue; }
          viewsBySlug.set(slug, (viewsBySlug.get(slug) ?? 0) + views);
        }
        const value: WallPopularity = { viewsBySlug, status: "live", asOf: new Date(now()).toISOString() };
        cache = { value, expires: now() + CACHE_MS };
        return value;
      } catch {
        const value = unavailable();
        cache = { value, expires: now() + CACHE_MS };
        return value;
      }
    })().finally(() => { pending = null; });
    return pending;
  };
}

export const getWallPopularity = createWallPopularityReader();
