import assert from "node:assert/strict";
import { createVercelPageviewsReader } from "../lib/onboarding/server-vercel.ts";
import { reconcilePageviews } from "../lib/onboarding/metrics.ts";

// Synthetic responses only. No Vercel requests, navigation events or accounts
// are created. Exercise the actual reader, then the actual public metrics route.
const at = Date.parse("2026-10-30T10:41:00.000Z");
let time = at;
let token: string | undefined = "test-only-private-token";
let calls = 0;
let failure = false;
let count = 28120;
let release: () => void = () => {};
const gate = new Promise<void>((resolve) => { release = resolve; });
const read = createVercelPageviewsReader({
  getToken: () => token, now: () => time,
  fetcher: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.vercel.com");
    assert.equal(url.pathname, "/v1/query/web-analytics/visits/count");
    assert.deepEqual([...url.searchParams.keys()].sort(), ["projectId", "teamId"]);
    assert.equal(url.searchParams.get("projectId"), "prj_fKFAsXiLsf2avMpOqjKjC0ili15S");
    assert.equal(url.searchParams.get("teamId"), "team_YXU6Q9GVndYBNQnFRo221v5l");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    assert.equal(init?.cache, "no-store");
    assert.ok(init?.signal instanceof AbortSignal);
    await gate;
    if (failure) return new Response("upstream error with private account data", { status: 403 });
    return Response.json({ data: { pageviews: count }, query: {
      since: "2026-04-06T00:00:00.000Z", until: "2026-10-31T00:00:00.000Z"
    } });
  }
});

const concurrent = Array.from({ length: 20 }, () => read());
assert.equal(calls, 1, "simultaneous polls share one upstream request");
release();
const firstBatch = await Promise.all(concurrent);
for (const result of firstBatch) {
  assert.equal(result.total, 28120);
  assert.equal(result.status, "live");
  assert.equal(result.snapshot, false);
  assert.equal(result.asOf, "2026-10-30T10:41:00.000Z", "asOf is the actual read time");
  assert.equal(result.rangeThrough, "2026-10-31T00:00:00.000Z", "rounded future boundary stays separate");
  assert.equal(JSON.stringify(result).includes("private-token"), false);
}
firstBatch[0].total = 999;
time += 14_999;
assert.equal((await read()).total, 28120, "callers cannot mutate the cached value");
assert.equal(calls, 1);
time++;
count = 28125;
assert.equal((await read()).total, 28125, "next polling interval refreshes the full historical total");
assert.equal(calls, 2);

const lastReadAt = new Date(time).toISOString();
time += 15_000;
failure = true;
const stale = await read();
assert.equal(stale.total, 28125);
assert.equal(stale.status, "stale");
assert.equal(stale.asOf, lastReadAt, "failure cannot advance a value's verification time");
assert.equal(stale.snapshot, true);
assert.equal(JSON.stringify(stale).includes("private account"), false);
await read();
assert.equal(calls, 3, "failed upstream polls also have a short retry cooldown");
time += 15_000;
failure = false;
assert.equal((await read()).status, "live", "successful retry clears the stale marker");
token = undefined;
assert.equal((await read()).status, "stale", "removing credentials must immediately stop live claims");
assert.equal(calls, 4);

let unauthenticatedCalls = 0;
const unconfigured = createVercelPageviewsReader({ getToken: () => undefined,
  fetcher: async () => { unauthenticatedCalls++; throw new Error("must not call"); }
});
const absent = await unconfigured();
assert.equal(absent.status, "unavailable");
assert.equal(absent.total, null, "no credential must not become zero or a hardcoded historical snapshot");
assert.equal(absent.asOf, null);
assert.equal(unauthenticatedCalls, 0);

for (const body of [null, {}, { data: { pageviews: -1 } }, { data: { pageviews: 1.5 } },
  { data: { pageviews: Number.MAX_SAFE_INTEGER + 1 } }, { data: { pageviews: "not a number" } }]) {
  const invalid = createVercelPageviewsReader({ getToken: () => "test-only", now: () => at,
    fetcher: async () => Response.json(body)
  });
  assert.equal((await invalid()).status, "unavailable", "malformed counts cannot enter the UI");
}
const zero = createVercelPageviewsReader({ getToken: () => "test-only", now: () => at,
  fetcher: async () => Response.json({ data: { pageviews: 0 } })
});
assert.equal((await zero()).total, 0, "a successful genuine zero differs from unavailable");
assert.equal((await zero()).since, null, "missing range metadata is not invented");
const networkFailure = createVercelPageviewsReader({ getToken: () => "test-only",
  fetcher: async () => { throw new DOMException("deadline", "TimeoutError"); }
});
assert.equal((await networkFailure()).status, "unavailable");

// Two independent serverless instances can reply in reverse freshness order
// even with sequential browser requests (for example focus before the 15s poll).
let instanceTime = at;
let instanceTotal = 100;
const instanceOptions = { getToken: () => "test-only", now: () => instanceTime,
  fetcher: async () => Response.json({ data: { pageviews: instanceTotal } }) };
const instanceA = createVercelPageviewsReader(instanceOptions);
const instanceB = createVercelPageviewsReader(instanceOptions);
await instanceA();
instanceTime += 5_000; instanceTotal = 101;
const newerReading = await instanceB();
instanceTime += 5_000;
const olderCachedReading = await instanceA();
assert.equal(olderCachedReading.total, 100, "the second instance really did return an older cache");
const latestDisplayed = reconcilePageviews(newerReading, olderCachedReading);
assert.equal(latestDisplayed.total, 101);
assert.equal(latestDisplayed.asOf, newerReading.asOf, "neither count nor verification time can rewind");
assert.equal(latestDisplayed.status, "live");
const failedInstance = reconcilePageviews(newerReading, { ...olderCachedReading, status: "stale", snapshot: true });
assert.equal(failedInstance.total, 101);
assert.equal(failedInstance.asOf, newerReading.asOf);
assert.equal(failedInstance.status, "stale", "retain newest value while reporting the failed refresh");
const coldFailure = reconcilePageviews(newerReading, absent);
assert.equal(coldFailure.total, 101);
assert.equal(coldFailure.asOf, newerReading.asOf);
assert.equal(coldFailure.status, "stale");
assert.deepEqual(reconcilePageviews(undefined, absent), absent, "first load with no credential stays unavailable");
instanceTime += 15_000; instanceTotal = 99;
const correctedReading = await instanceB();
assert.equal(reconcilePageviews(latestDisplayed, correctedReading).total, 99, "accept a genuinely newer downward correction; do not clamp to max(total)");
assert.equal(reconcilePageviews(failedInstance, correctedReading).status, "live", "a newer successful read clears the failure marker");

const envNames = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VERCEL_ANALYTICS_TOKEN"] as const;
const savedEnv = Object.fromEntries(envNames.map((key) => [key, process.env[key]]));
const savedFetch = globalThis.fetch;
try {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://onboarding-fixture.example.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-only-anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-only-service-key";
  delete process.env.VERCEL_ANALYTICS_TOKEN;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === "https://api.vercel.com") {
      assert.equal(url.pathname, "/v1/query/web-analytics/visits/count");
      assert.deepEqual([...url.searchParams.keys()].sort(), ["projectId", "teamId"]);
      return Response.json({ data: { pageviews: 28120 }, query: {
        since: "2026-04-06T00:00:00.000Z", until: "2026-10-31T00:00:00.000Z"
      } });
    }
    assert.equal(url.origin, "https://onboarding-fixture.example.test", "no request may reach production");
    assert.equal(init?.method, "POST");
    if (url.pathname === "/rest/v1/rpc/onboarding_get_summary") return Response.json({
      registeredUsers: 790, livePageviews: 987654, pageviewStartedAt: "2026-10-29T10:38:39.000Z", countsAsOf: new Date(at).toISOString()
    });
    if (url.pathname === "/rest/v1/rpc/onboarding_catalog_counts") return Response.json({
      catalogCount: 3, brands: ["Nike", "361 degrees", "361°"], countsAsOf: new Date(at).toISOString()
    });
    throw new Error(`Unexpected test request: ${url.pathname}`);
  };
  const { GET } = await import("../app/api/onboarding/metrics/route.ts");
  const unavailableResponse = await GET();
  assert.equal(unavailableResponse.status, 200, "missing analytics credentials must not hide catalogue/account aggregates");
  const unavailableMetrics = await unavailableResponse.json();
  assert.equal(unavailableMetrics.pageviews.status, "unavailable");
  assert.equal(unavailableMetrics.registeredUsers, 790);
  assert.equal(unavailableMetrics.catalogCount, 3);
  assert.equal(unavailableMetrics.brandCount, 2);
  process.env.VERCEL_ANALYTICS_TOKEN = "test-only-analytics-key";
  const response = await GET();
  assert.equal(response.status, 200);
  const metrics = await response.json();
  assert.equal(metrics.pageviews.total, 28120, "public total is Vercel history, never the independent 987654 navigation ledger");
  assert.equal(metrics.pageviews.status, "live");
  assert.equal("livePageviews" in metrics, false);
  assert.equal("pageviewStartedAt" in metrics, false);
  for (const header of ["cache-control", "cdn-cache-control", "vercel-cdn-cache-control"]) {
    assert.match(response.headers.get(header) ?? "", /no-store/);
  }
  assert.equal(JSON.stringify(metrics).includes("test-only"), false);
} finally {
  globalThis.fetch = savedFetch;
  for (const key of envNames) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
}

console.log("Vercel onboarding metrics checks passed: production lifetime query, current-day boundary, read timestamp, 15s refresh, single-flight, cross-instance cache ordering and downward correction, stale recovery, no-credential/invalid-response handling, isolated public route, no ledger mixing, no-store headers.");
