import { safeCount, UNAVAILABLE_VERCEL_PAGEVIEWS, type OnboardingPageviews } from "./server-contract";

const PROJECT_ID = "prj_fKFAsXiLsf2avMpOqjKjC0ili15S";
const TEAM_ID = "team_YXU6Q9GVndYBNQnFRo221v5l";
const CACHE_MS = 15_000;

type Options = {
  getToken?: () => string | undefined;
  fetcher?: typeof fetch;
  now?: () => number;
};

function sourceDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

/** Server-only reader; credentials never enter the public metrics payload. */
export function createVercelPageviewsReader({
  getToken = () => process.env.VERCEL_ANALYTICS_TOKEN,
  fetcher = (...args) => fetch(...args),
  now = Date.now
}: Options = {}) {
  let cache: { value: OnboardingPageviews; expires: number } | null = null;
  let pending: Promise<OnboardingPageviews> | null = null;

  return async function getVercelPageviews(): Promise<OnboardingPageviews> {
    const token = getToken()?.trim();
    // A missing credential cannot turn a historical value into a live value.
    if (!token) return cache && cache.value.total !== null
      ? { ...cache.value, status: "stale", snapshot: true }
      : { ...UNAVAILABLE_VERCEL_PAGEVIEWS };
    if (cache && cache.expires > now()) return { ...cache.value };
    if (pending) return { ...await pending };

    pending = (async () => {
      const url = new URL("https://api.vercel.com/v1/query/web-analytics/visits/count");
      url.searchParams.set("projectId", PROJECT_ID);
      url.searchParams.set("teamId", TEAM_ID);
      // Count defaults to all production pages since Analytics was enabled.
      // Do not set dates or filters: until=now is rounded down by the API and
      // can omit today's traffic. This is independent of our navigation ledger.
      try {
        const response = await fetcher(url, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store", signal: AbortSignal.timeout(2500)
        });
        if (!response.ok) throw new Error("analytics unavailable");
        const body = await response.json() as {
          data?: { pageviews?: unknown }; query?: { since?: unknown; until?: unknown }
        };
        const total = safeCount(body?.data?.pageviews);
        if (total === null) throw new Error("invalid analytics count");
        const fetchedAt = now();
        const value: OnboardingPageviews = {
          total, source: "vercel", since: sourceDate(body.query?.since),
          rangeThrough: sourceDate(body.query?.until),
          asOf: new Date(fetchedAt).toISOString(), status: "live", snapshot: false
        };
        cache = { value, expires: fetchedAt + CACHE_MS };
        return value;
      } catch {
        // Never manufacture zero, add the onboarding counter, advance asOf on
        // failure, or expose upstream errors that may contain account details.
        const value: OnboardingPageviews = cache && cache.value.total !== null
          ? { ...cache.value, status: "stale", snapshot: true }
          : { ...UNAVAILABLE_VERCEL_PAGEVIEWS };
        cache = { value, expires: now() + CACHE_MS };
        return value;
      }
    })().finally(() => { pending = null; });
    return { ...await pending };
  };
}

export const getVercelPageviews = createVercelPageviewsReader();
