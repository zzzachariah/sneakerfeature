import assert from 'node:assert/strict';
import { shuffleWallItems, shiftWallTimeline } from '../lib/onboarding/wall-motion.ts';
import { buildOnboardingCatalog } from '../lib/onboarding/server-catalog.ts';
import { createWallPopularityReader } from '../lib/onboarding/server-wall-popularity.ts';
import type { Shoe } from '../lib/types.ts';

const input = [1, 2, 3, 4, 5, 6];
const shuffled = shuffleWallItems(input, () => 0);
assert.deepEqual(input, [1, 2, 3, 4, 5, 6], 'randomization never mutates source data');
assert.notDeepEqual(shuffled, input);
assert.deepEqual([...shuffled].sort(), input);
assert.deepEqual(shuffleWallItems([], () => 0), []);
assert.deepEqual(shuffleWallItems([1], () => 0), [1]);
const width = 1200, duration = 60000;
const phase = (time: number) => ((-time / duration * width % width) + width) % width;
for (const start of [0, 10, 59990, 60000, 180000]) {
  for (const delta of [-4000, -200, -1, 0, 1, 200, 4000]) {
    const shifted = shiftWallTimeline(start, delta, width, duration);
    assert(shifted >= 0 && shifted < duration, 'both directions stay in one seamless cycle');
    const expected = ((phase(start) + delta) % width + width) % width;
    assert(Math.abs(phase(shifted) - expected) < 1e-6, 'gesture distance is preserved across wrap boundaries');
  }
}
assert.equal(shiftWallTimeline(123, 9, 0, duration), 123, 'unmeasured rows cannot jump');
assert.equal(shiftWallTimeline(123, Infinity, width, duration), 123);
const spec = { cushioning_feel: 'soft cushioning', court_feel: 'low to the ground', bounce: 'high bounce', stability: 'wide base support', traction: 'strong grip', fit: 'snug fit' };
const shoes: Shoe[] = Array.from({ length: 60 }, (_, i) => ({ id: `s${i}`, slug: `s${i}`, shoe_name: `Shoe ${i}`, brand: ['A', 'B', 'C'][i % 3], image_url: `https://example.test/${i}-nobg.png`, spec, price: 99 }));
const first = buildOnboardingCatalog(shoes, 24, () => 0);
const second = buildOnboardingCatalog(shoes, 24, () => .999);
assert.notDeepEqual(new Set(first.shoes.map(s => s.slug)), new Set(second.shoes.map(s => s.slug)), 'new random seeds change the sample, not only its ordering');
for (const wall of [first, second]) {
  assert.equal(wall.shoes.length, 24);
  assert.equal(new Set(wall.shoes.map(s => s.slug)).size, 24);
  assert.equal(new Set(wall.shoes.map(s => s.brand)).size, 3);
  assert.equal(wall.shoeCount, 60);
  assert.equal(wall.brandCount, 3);
  assert(wall.shoes.every(s => !('price' in s.shoe)), 'random sampling retains the public allowlist');
}
const viewsBySlug = new Map(shoes.slice(0, 40).map((shoe, i) => [shoe.slug, 100 - i]));
const popularity = { viewsBySlug, status: 'live' as const, asOf: '2026-10-30T12:00:00.000Z' };
const mixA = buildOnboardingCatalog(shoes, 25, () => 0, popularity);
const mixB = buildOnboardingCatalog(shoes, 25, () => .999, popularity);
for (const mix of [mixA, mixB]) {
  assert.equal(mix.shoes.length, 25);
  assert.equal(new Set(mix.shoes.map(s => s.shoe.id)).size, 25);
  assert.equal(mix.shoes.filter(s => Number(s.slug.slice(1)) < 25).length, 20, 'exactly 80% from the traffic-ranked popular pool');
  assert.equal(mix.selection.popularCount, 20);
  assert.equal(mix.selection.discoveryCount, 5);
  assert.equal(mix.selection.status, 'live');
}
assert.notDeepEqual(mixA.shoes.map(s => s.slug), mixB.shoes.map(s => s.slug));
assert.notDeepEqual(new Set(mixA.shoes.map(s => s.slug)), new Set(mixB.shoes.map(s => s.slug)), 'both hot picks and discoveries may change on replay');
const small = buildOnboardingCatalog(shoes.slice(0, 8), 25, () => .5, popularity);
assert.equal(small.shoes.length, 8, 'small catalogues retain every shoe, without duplicated filler');
assert.equal(small.selection.popularCount, 6);
const sparse = buildOnboardingCatalog(shoes, 25, () => .5, { ...popularity, viewsBySlug: new Map([['s0', 3]]) });
assert.equal(sparse.selection.popularCount, 1, 'sparse traffic is never promoted into fabricated popularity');
assert.equal(sparse.shoes.length, 25);
const noData = buildOnboardingCatalog(shoes);
assert.equal(noData.selection.status, 'unavailable');
assert.equal(noData.selection.popularCount, 0);
assert.equal(noData.shoes.length, 25, 'analytics outages do not remove the wall');

let now = Date.parse('2026-10-30T12:00:00.000Z'), calls = 0, fail = false;
const read = createWallPopularityReader({ getToken: () => 'test-only-token', now: () => now,
  fetcher: async (input, init) => {
    calls++;
    const url = new URL(String(input));
    assert.equal(url.pathname, '/v1/query/web-analytics/visits/aggregate');
    assert.equal(url.searchParams.get('by'), 'requestPath');
    assert.equal(url.searchParams.get('filter'), "startswith(requestPath, '/shoes/')");
    assert.equal(url.searchParams.get('since'), '2026-10-01T00:00:00.000Z');
    assert.equal(url.searchParams.get('until'), '2026-10-31T00:00:00.000Z');
    assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(init?.cache, 'no-store');
    if (fail) throw new Error('private upstream error');
    return Response.json({ data: [
      { requestPath: '/shoes/s0', pageviews: 30 }, { requestPath: '/shoes/s0/', pageviews: 2 },
      { requestPath: '/shoes/s%31', pageviews: 5 }, { requestPath: '/shoes/s2', pageviews: -1 },
      { requestPath: '/shoes/s3', pageviews: 'bad' }, { requestPath: '/shoes/s4/nested', pageviews: 90 },
      { requestPath: '/shoes/%invalid', pageviews: 2 }, { requestPath: '/', pageviews: 1000 },
      { requestPath: 'Others', pageviews: 900 }
    ] });
  }
});
const [report, sameReport] = await Promise.all([read(), read()]);
assert.equal(calls, 1, 'concurrent arrivals share one analytics read');
assert.deepEqual([...report.viewsBySlug], [['s0', 32], ['s1', 5]], 'only genuine shoe detail counts are retained');
assert.equal(report.status, sameReport.status);
await read(); assert.equal(calls, 1, 'short cache avoids per-visitor upstream calls');
now += 61_000; fail = true;
const stale = await read();
assert.equal(stale.status, 'stale'); assert.equal(stale.asOf, report.asOf);
assert.deepEqual([...stale.viewsBySlug], [...report.viewsBySlug]);
const missing = await createWallPopularityReader({ getToken: () => undefined, fetcher: async () => { throw new Error('must not fetch'); } })();
assert.equal(missing.status, 'unavailable');
const broken = await createWallPopularityReader({ getToken: () => 'test-only-token', fetcher: async () => Response.json({ unexpected: true }) })();
assert.equal(broken.status, 'unavailable');
console.log('Shoe wall: 80/20 real-traffic sampling, random/unique/brand-diverse public data, unavailable/stale analytics, request isolation, seamless bidirectional drag math passed.');
