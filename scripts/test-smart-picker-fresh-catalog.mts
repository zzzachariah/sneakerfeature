import assert from "node:assert/strict";
import { build } from "esbuild";

let total = 1001;
let failedPage = false;
const calls: { table: string; from: number; to: number; cache?: RequestCache }[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(String(input));
  const table = url.pathname.slice(1), from = Number(url.searchParams.get("from")), to = Number(url.searchParams.get("to"));
  calls.push({ table, from, to, cache: init?.cache });
  const data = table === "shoes" ? Array.from({ length: Math.max(0, Math.min(total, to + 1) - from) }, (_, i) => ({ id: `shoe${from + i}`, slug: `shoe-${from + i}`, brand: "Nike", shoe_name: `Model ${from + i}`, release_year: 2016, price: 800, shoe_specs: [{ id: "spec", updated_at: "2026-11-18T00:00:00Z", cushioning_feel: "Soft", fit: "Standard", traction: "Excellent" }], shoe_images: [] })) : [];
  return Response.json({ data: failedPage && from >= 500 ? null : data, error: failedPage && from >= 500 ? { message: "Later catalog page failed" } : null });
};
(globalThis as unknown as { __freshPublicClient: unknown }).__freshPublicClient = (fetcher: typeof fetch) => {
  const query = (table: string) => {
    const chain = { select() { return chain; }, eq() { return chain; }, order() { return chain; }, limit() { return chain; }, async range(from: number, to: number) { return (await fetcher(`https://catalog.test/${table}?from=${from}&to=${to}`, { cache: "force-cache" })).json(); } };
    return chain;
  };
  return { from: query, rpc: query };
};
const bundle = await build({ entryPoints: [new URL("../lib/data/shoes.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm", plugins: [{ name: "fresh-catalog-only", setup(b) {
  b.onResolve({ filter: /^(react|next\/cache|@\/lib\/supabase\/(?:server|public)|@\/lib\/data\/auth)$/ }, args => ({ path: args.path, namespace: "test" }));
  b.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents:
    args.path === "react" ? "export const cache = fn => fn;" :
    args.path === "next/cache" ? "export const unstable_cache = () => () => {throw Error('Fresh catalog used application cache')};" :
    args.path.endsWith("/public") ? "export const createPublicClient=globalThis.__freshPublicClient;" :
    args.path.endsWith("/server") ? "export const createClient=()=>{throw Error('Fresh public catalog accessed user data')};" :
    "export const getCurrentProfile=()=>{throw Error('Fresh public catalog accessed profile')};"
  }));
} }] });
try {
  const { getFreshPublicShoes } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  const initial = await getFreshPublicShoes();
  assert.equal(initial.length, 1001, "Full catalog must paginate beyond API row limits");
  assert.equal(initial[1000].release_year, 2016, "Older models remain available");
  assert.equal(initial[1000].spec.fit, "Standard");
  assert.ok(calls.every(call => call.cache === "no-store"));
  assert.deepEqual(calls.filter(call => call.table === "shoes").map(call => call.from), [0, 500, 1000]);
  total = 1002;
  assert.equal((await getFreshPublicShoes()).length, 1002, "The next confirmed run observes database edits without waiting for cache TTL");
  failedPage = true;
  await assert.rejects(getFreshPublicShoes(), /Later catalog page failed/, "A partial catalog must not become a recommendation pool");
  failedPage = false; total = 0;
  await assert.rejects(getFreshPublicShoes(), /Catalog unavailable/, "Empty live data must never silently use demonstration shoes");
  console.log("Smart Picker catalog: uncached complete pagination, immediate updates, older models, detailed specs and no partial/demo fallback passed.");
} finally { globalThis.fetch = originalFetch; }
