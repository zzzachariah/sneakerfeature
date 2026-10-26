import assert from "node:assert/strict";
import { getCatalogueUpdates, getLatestCatalogueUpdate } from "../lib/data/catalogue-updates";
import { beijingWeekStart, catalogueMaintenanceRunSchema, groupMaintenanceRuns, summarizeMaintenanceRun } from "../lib/catalogue-updates";

const localized = (value: string) => ({ en: value, zh: value });
const entry = (kind: "updated" | "pending", name: string) => ({
  kind, name, slug: name.toLowerCase(), summary: localized("Evidence-backed scope, with remaining questions stated separately."),
  changes: [], sources: [{ publisher: "Original reviewer", url: "https://example.org/review", readDate: "2026-10-25", supports: ["traction"] }],
});
const fixture = {
  id: "b5b32a00-d971-4def-b701-682883026635", scheduled_for: "2026-10-25", completed_at: "2026-10-26T01:15:00Z", status: "partial",
  report: {
    version: 1, title: localized("October 25 maintenance"), summary: localized("Two existing shoes checked; one remains unresolved."),
    counts: { added: 0, updated: 1, recheckAttempted: 2, recheckVerified: 1, pending: 1, candidates: 0 },
    entries: [entry("updated", "Corrected"), entry("pending", "Unresolved")], notes: [],
    verification: { databaseReadback: true, anonymousReadback: true, publicBody: true, visualScreenshot: false, limitations: [localized("No screenshot verification.")] },
  },
};
const copy = () => structuredClone(fixture);
assert(catalogueMaintenanceRunSchema.safeParse(fixture).success);
const run = catalogueMaintenanceRunSchema.parse(fixture);

// Scheduled Sunday remains in its Beijing calendar week even when completed on Monday.
assert.equal(beijingWeekStart(run.scheduled_for), "2026-10-19");
assert.equal(beijingWeekStart("2026-10-26"), "2026-10-26");
assert.equal(beijingWeekStart("2027-01-01"), "2026-12-28");
assert.throws(() => beijingWeekStart("2026-02-30"));
const next = { ...run, id: "0a124568-85d6-4123-8b17-2836311b3438", scheduled_for: "2026-10-26" };
assert.deepEqual(groupMaintenanceRuns([run, next, run]).map((group) => [group.week, group.runs.length]), [["2026-10-26", 1], ["2026-10-19", 1]]);

// Public rows and each nested object are closed schemas; raw management data cannot ride along.
assert(!catalogueMaintenanceRunSchema.safeParse({ ...copy(), actor_admin_id: "private-actor" }).success);
const privateReport = { ...copy(), report: { ...copy().report, before_payload: { private_profile: "private" } } };
assert(!catalogueMaintenanceRunSchema.safeParse(privateReport).success);
const privateEntry = copy();
assert(!catalogueMaintenanceRunSchema.safeParse({ ...privateEntry, report: { ...privateEntry.report, entries: [{ ...privateEntry.report.entries[0], created_by: "private" }, privateEntry.report.entries[1]] } }).success);

for (const url of ["not a URL", "https://[invalid", "javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "https://account:password@example.org/review"]) {
  const bad = copy(); bad.report.entries[0].sources[0].url = url;
  assert(!catalogueMaintenanceRunSchema.safeParse(bad).success, url);
}
const path = copy(); path.report.entries[0].slug = "../../admin";
assert(!catalogueMaintenanceRunSchema.safeParse(path).success);
const date = copy(); date.report.entries[0].sources[0].readDate = "2026-02-30";
assert(!catalogueMaintenanceRunSchema.safeParse(date).success);
const wrongCount = copy(); wrongCount.report.counts.recheckVerified = 2;
assert(!catalogueMaintenanceRunSchema.safeParse(wrongCount).success, "Pending must not silently count as verified");
const duplicate = copy(); duplicate.report.entries[1].slug = "corrected";
assert(!catalogueMaintenanceRunSchema.safeParse(duplicate).success);

const failed = copy(); failed.status = "failed"; failed.report.entries = [];
failed.report.counts = { added: 0, updated: 0, recheckAttempted: 0, recheckVerified: 0, pending: 0, candidates: 0 };
failed.report.verification = { databaseReadback: false, anonymousReadback: false, publicBody: false, visualScreenshot: false, limitations: [localized("Connection unavailable; no changes confirmed.")] };
assert(catalogueMaintenanceRunSchema.safeParse(failed).success, "Failed and no-change runs remain publishable records");

// The home entry does not serialize the complete shoe evidence payload.
const summary = summarizeMaintenanceRun(run);
assert(!("entries" in summary.report));
assert(!("verification" in summary.report));
assert.deepEqual(summary.report.counts, run.report.counts);
// Exercise the real Supabase data readers through mocked HTTP, rather than checking
// source text. Separate reads must see a correction without cache invalidation or a
// new deployment; both the timeline and homepage reader must opt out of fetch cache.
const originalFetch = globalThis.fetch;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const requests: { url: URL; cache: RequestCache | undefined }[] = [];
let published = copy();
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://catalogue-freshness-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-anon-key";
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.hostname, "catalogue-freshness-test.supabase.co");
  assert.equal(url.pathname, "/rest/v1/catalogue_maintenance_runs");
  requests.push({ url, cache: init?.cache });
  return new Response(JSON.stringify([published]), { status: 200, headers: { "content-type": "application/json" } });
};
try {
  const initialTimeline = await getCatalogueUpdates();
  const initialLatest = await getLatestCatalogueUpdate();
  assert.equal(initialTimeline.state, "ready");
  assert.equal(initialLatest.state, "ready");
  assert.equal(initialTimeline.runs[0].report.verification.visualScreenshot, false);
  assert.equal(summarizeMaintenanceRun(initialLatest.runs[0]).report.title.en, fixture.report.title.en);

  published = copy();
  published.completed_at = "2026-10-26T02:15:00Z";
  published.report.title = localized("Corrected published maintenance report");
  published.report.entries[0].summary = localized("The corrected evidence is visible on the next read.");
  published.report.verification.visualScreenshot = true;
  const correctedTimeline = await getCatalogueUpdates();
  const correctedLatest = await getLatestCatalogueUpdate();
  assert.equal(correctedTimeline.runs[0].id, initialTimeline.runs[0].id);
  assert.equal(correctedTimeline.runs[0].completed_at, published.completed_at);
  assert.equal(correctedTimeline.runs[0].report.verification.visualScreenshot, true);
  assert.equal(correctedTimeline.runs[0].report.entries[0].summary.en, published.report.entries[0].summary.en);
  assert.equal(summarizeMaintenanceRun(correctedLatest.runs[0]).report.title.en, published.report.title.en);
  assert.equal(correctedLatest.runs[0].completed_at, published.completed_at);
  assert.equal(requests.length, 4, "Each independent read must reach the published data provider");
  for (const request of requests) {
    assert.equal(request.cache, "no-store");
    assert.equal(request.url.searchParams.get("is_published"), "eq.true");
    assert.equal(request.url.searchParams.get("report->>version"), "eq.1");
    assert.match(request.url.searchParams.get("completed_at") ?? "", /^lte\./);
  }
  assert.equal(requests.filter(({ url }) => url.searchParams.get("limit") === "1").length, 2);

  // Fetch errors still produce the unavailable state without infrastructure details.
  globalThis.fetch = async () => new Response(JSON.stringify({ message: "private test infrastructure details" }), { status: 503 });
  assert.deepEqual(await getCatalogueUpdates(), { state: "unavailable", runs: [], omittedInvalidRuns: 0 });
} finally {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
}
console.log("Catalogue updates: public-data boundaries, input safety, counts, Beijing weeks and next-read freshness passed.");
