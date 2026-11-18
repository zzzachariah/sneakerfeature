import assert from "node:assert/strict";
import { getFreshPublicShoes } from "../lib/data/shoes";

const savedFetch = globalThis.fetch;
const savedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const savedKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const requests: { path: string; offset: number; cache?: RequestCache }[] = [];
const shoe = (index: number) => ({
  id: `shoe-${index}`, slug: `shoe-${index}`, brand: "Test", shoe_name: `Shoe ${index}`,
  release_year: index % 2 ? 2014 : 2026, category: "basketball", shoe_specs: [], shoe_images: []
});
let rows = Array.from({ length: 563 }, (_, index) => shoe(index));
let failPage = false;
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://picker-freshness-test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test-anon-key";
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.hostname, "picker-freshness-test.supabase.co", "Tests must not reach production");
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const limit = Number(url.searchParams.get("limit") ?? 500);
  requests.push({ path: url.pathname, offset, cache: init?.cache });
  assert.equal(init?.cache, "no-store", "Every database read must bypass the fetch cache");
  if (url.pathname === "/rest/v1/rpc/catalog_rating_summary") return Response.json([]);
  assert.equal(url.pathname, "/rest/v1/shoes");
  if (failPage && offset > 0) return Response.json({ message: "page unavailable" }, { status: 400 });
  return Response.json(rows.slice(offset, offset + limit));
};
try {
  const first = await getFreshPublicShoes();
  assert.equal(first.length, 563, "All pages, including older models, reach the picker");
  assert(first.some(item => item.release_year === 2014), "Older unselected shoes remain eligible");
  assert.equal(first.at(-1)?.id, "shoe-562");
  rows.push(shoe(563));
  rows[0].shoe_name = "Corrected name";
  const second = await getFreshPublicShoes();
  assert.equal(second.length, 564, "The next run sees a new row without cache invalidation");
  assert.equal(second[0].shoe_name, "Corrected name", "The next run sees edited records too");
  assert.deepEqual(requests.filter(item => item.path.endsWith("/shoes")).map(item => item.offset), [0, 500, 0, 500]);
  failPage = true;
  await assert.rejects(getFreshPublicShoes, /page unavailable/, "A failed page must not become a partial loaded count");
  failPage = false;
  rows = [];
  await assert.rejects(getFreshPublicShoes, /empty catalog/, "An empty database must not produce a successful loaded event");
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  await assert.rejects(getFreshPublicShoes, /public client unavailable/, "Missing credentials must not load demo shoes");
} finally {
  globalThis.fetch = savedFetch;
  if (savedUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = savedUrl;
  if (savedKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = savedKey;
}
console.log("PASS picker loads the full fresh public catalog; subsequent additions/edits appear; failed or empty reads never become loaded counts.");
