import assert from "node:assert/strict";
import { webSearch, getWebSearchProvider, isWebSearchConfigured, describeWebSearchError } from "../lib/ai/web-search";

const originalFetch = globalThis.fetch;
const env = { ...process.env };
const calls: Request[] = [];
let respond = () => new Response(JSON.stringify({ results: [
  { title: "中文测评", url: "https://example.com/review", content: "抓地力证据", published_date: "2026-10-29" },
  { title: "Unsafe", url: "javascript:alert(1)", content: "ignored" },
  { title: "Long review", url: "https://example.com/long", content: "x".repeat(900) },
  null
], usage: { credits: 1 } }));
globalThis.fetch = async (input, init) => { calls.push(new Request(input, init)); return respond(); };
process.env.TAVILY_API_KEY = "fixture-tavily-key";
process.env.BOCHA_API_KEY = "fixture-bocha-key";
process.env.WEB_SEARCH_PROVIDER = "tavily";
try {
  const result = await webSearch("篮球鞋 抓地力", { count: 12 });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected search results");
  assert.equal(result.results.length, 2);
  assert.equal(result.results[0].snippet, "抓地力证据");
  assert.equal(result.results[0].datePublished, "2026-10-29");
  assert.equal(result.results[1].snippet.length, 601);
  assert.equal(calls[0].url, "https://api.tavily.com/search");
  assert.equal(calls[0].headers.get("authorization"), "Bearer fixture-tavily-key");
  const body = await calls[0].json();
  assert.equal(body.search_depth, "basic");
  assert.equal(body.auto_parameters, false);
  assert.equal(body.include_answer, false);
  assert.equal(body.include_raw_content, false);
  assert.equal(body.include_images, false);
  assert.equal(body.max_results, 3);
  assert.equal(body.language, "zh-cn");

  for (const [status, expected] of [[401, "auth"], [429, "rate_limited"], [432, "quota_exceeded"], [433, "quota_exceeded"], [500, "upstream"]] as const) {
    respond = () => new Response("fixture-tavily-key", { status });
    const before = calls.length;
    const failure = await webSearch("review");
    assert.equal(failure.ok, false);
    if (failure.ok) throw new Error("Expected failure");
    assert.equal(failure.error, expected);
    assert.ok(!failure.detail.includes("fixture-tavily-key"));
    assert.equal(calls.length, before + 1, "Errors must not retry or fall back to another account");
    assert.equal(calls.at(-1)!.url, "https://api.tavily.com/search");
  }
  for (const payload of ["null", "invalid JSON", "[]"]) {
    respond = () => new Response(payload);
    const failure = await webSearch("review");
    assert.ok(!failure.ok && failure.error === "parse");
  }
  respond = () => new Response(JSON.stringify({ results: [] }));
  const empty = await webSearch("review");
  assert.ok(!empty.ok && empty.error === "no_results");
  delete process.env.TAVILY_API_KEY;
  assert.equal(isWebSearchConfigured(), false, "Selected Tavily must not silently use the Bocha key");
  const missing = await webSearch("review");
  assert.ok(!missing.ok && missing.error === "missing_api_key");
  process.env.WEB_SEARCH_PROVIDER = "bocha";
  assert.equal(getWebSearchProvider(), "bocha");
  respond = () => new Response(JSON.stringify({ code: 200, data: { webPages: { value: [
    { name: "Legacy", url: "https://example.com/legacy", summary: "Summary", siteName: "Example" }
  ] } } }));
  const legacy = await webSearch("review");
  assert.ok(legacy.ok && legacy.results[0].snippet === "Summary");
  assert.equal(calls.at(-1)!.url, "https://api.bochaai.com/v1/web-search");

  globalThis.fetch = async (_input, init) => new Promise((_resolve, reject) => {
    const abort = () => reject(new DOMException("Aborted", "AbortError"));
    if (init?.signal?.aborted) abort();
    else init?.signal?.addEventListener("abort", abort, { once: true });
  });
  const timeout = await webSearch("review", { timeoutMs: 5 });
  assert.ok(!timeout.ok && timeout.error === "timeout");
  const aborted = await webSearch("review", { signal: AbortSignal.abort(), timeoutMs: 1000 });
  assert.ok(!aborted.ok && aborted.error === "timeout");
  assert.match(describeWebSearchError("quota_exceeded"), /额度已用完/);
  console.log("Web search: Tavily basic billing, source mapping, errors, timeout, secret redaction and Bocha compatibility passed.");
} finally {
  globalThis.fetch = originalFetch;
  for (const name of ["TAVILY_API_KEY", "BOCHA_API_KEY", "WEB_SEARCH_PROVIDER"]) {
    if (env[name] === undefined) delete process.env[name]; else process.env[name] = env[name];
  }
}
