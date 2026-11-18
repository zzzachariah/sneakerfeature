import assert from "node:assert/strict";
import type OpenAI from "openai";
import type { Shoe } from "../lib/types";
import type { RecommendProgress } from "../lib/ai/types";
import { recommendOnboardingShoes } from "../lib/ai/recommend";
import { PACKY_MODEL } from "../lib/ai/packy-client";
import { pickerAnswersContext, pickerResearchFocus, pickerPriceResearchFocus, type PickerAnswers, type PickerQuestionSet } from "../lib/onboarding/picker-questions";

const names = ["Probe Guard 1", "Probe Wing 2"];
const shoes: Shoe[] = names.map((shoe_name, i) => ({
  id: `probe-${i}`, slug: `probe-${i}`, brand: "Test", shoe_name, release_year: i ? 2026 : 2014,
  weight: i ? "355g" : null,
  spec: { traction: "Good traction", stability: "Stable platform", fit: "Secure fit", cushioning_feel: "Comfortable cushioning", forefoot_midsole_tech: "Documented forefoot technology", upper_tech: "Documented knit upper", outsole_tech: "Documented rubber outsole", playstyle_summary: "Guard movement" }
}));
const l = (en: string) => ({ en, zh: "测试偏好" });
const questions: PickerQuestionSet = { intro: l("Four details"), questions: [
  { id: "profile", prompt: l("Confirm priorities?"), reason: l("Use confirmed priorities.") },
  { id: "age", prompt: l("Older models?"), reason: l("Keep suitable models.") },
  { id: "fit", prompt: l("Fit concerns?"), reason: l("Check exact-model fit.") },
  { id: "budget", prompt: l("Budget?"), reason: l("Check current prices.") }
] };
const answers: PickerAnswers = { choices: { profile: "adjust", age: "any", fit: "wide", budget: "limit" }, note: "Comfort matters more than traction now. Budget 120 USD. I have a high instep. My private reference is SECRET-PERSON-99." };
const currentInput = "PG / SG, original priorities traction, stability and fit." + pickerAnswersContext(questions, answers, "en");
const savedFetch = globalThis.fetch;
const savedEnv = { key: process.env.TAVILY_API_KEY, provider: process.env.WEB_SEARCH_PROVIDER, bocha: process.env.BOCHA_API_KEY };
process.env.TAVILY_API_KEY = "fixture-no-network";
process.env.WEB_SEARCH_PROVIDER = "tavily";
delete process.env.BOCHA_API_KEY;
let round = 0, modelCalls = 0;
const calls: { kind: "shortlist" | "search" | "final"; round: number; query?: string }[] = [];
const progress: RecommendProgress[] = [];
const goodUrl = (index: number, price: boolean) => `https://evidence.example/probe-${index}/${price ? "retailer" : "review"}`;
const badUrl = (index: number) => `https://evidence.example/probe-${index}-ultra-v2`;
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.href, "https://api.tavily.com/search", "No real network or unexpected endpoint is permitted");
  const request = JSON.parse(String(init?.body));
  assert.equal(request.search_depth, "basic");
  assert.equal(request.include_answer, false);
  const query = String(request.query);
  assert(!query.includes("SECRET-PERSON-99"), "Raw user notes must not leak to the search provider");
  const index = names.findIndex(name => query.includes(name));
  assert(index >= 0, "Research must name one of the shortlisted catalog models");
  assert.equal(calls.filter(call => call.kind === "shortlist" && call.round === round).length, 1, "Shortlist must precede all research");
  assert.equal(calls.filter(call => call.kind === "final" && call.round === round).length, 0, "Research must complete before recommendations");
  const price = query.includes("current price");
  if (price) { assert.match(query, /USD/); assert.match(query, /\d{4}-\d{2}-\d{2}/); }
  else {
    assert.match(query, /wide feet/); assert.match(query, /high instep/);
    if (index === 0) assert.match(query, /measured weight/, "Missing candidate data should guide the probe");
    else assert.doesNotMatch(query, /measured weight/, "Known catalog weight need not be guessed or re-researched");
  }
  calls.push({ kind: "search", round, query });
  return Response.json({ results: [
    { title: `${names[index]} Ultra V2 Basketball Review`, url: badUrl(index), content: "UNSUPPORTED_VARIANT_EVIDENCE: different model details." },
    { title: `${names[index]} ${price ? "Basketball shoes retailer listing" : "Basketball performance review"}`, url: goodUrl(index, price), content: price ? `Current quoted price is ${round ? 115 : 120} USD from Fixture Retailer; availability is not guaranteed.` : "Review reports forefoot room and instep pressure trade-offs for this exact shoe.", published_date: "2026-11-18" }
  ], usage: { credits: 1 } });
};
const client = { chat: { completions: { create: async (params: any) => {
  const phase = modelCalls++ % 2 === 0 ? "shortlist" : "final";
  calls.push({ kind: phase, round });
  const text = params.messages.map((message: any) => message.content).join("\n");
  assert(text.includes(answers.note), "Both model phases must receive confirmed answers and additional input");
  if (phase === "shortlist") {
    assert(text.includes('"year":2014'), "Older unselected models remain in the full catalog");
    assert(text.includes('research:[{name:exact_candidate_name,needs:[...]}]'));
  } else {
    const liveSearches = calls.filter(call => call.kind === "search" && call.round === round);
    assert.equal(liveSearches.length, round ? 2 : 4, "Cached fit evidence may be reused, but current-price probes must run each time");
    assert(text.includes("Documented forefoot technology") && text.includes("Documented knit upper") && text.includes("Documented rubber outsole"), "Final ranking receives detailed catalog facts");
    assert(text.includes('"weight":"355g"'));
    assert(text.includes(round ? "115 USD" : "120 USD"), "Final answer uses the latest retailer quote");
    assert(!text.includes("UNSUPPORTED_VARIANT_EVIDENCE") && !text.includes(badUrl(0)), "Other versions cannot become evidence for this base model");
    assert(text.includes("Published: 2026-11-18"));
    assert.match(text, /Corrections override the original profile/);
    assert.match(text, /Do not ask further questions/);
  }
  const output = phase === "shortlist" ? { candidates: names, backups: [], research: names.map(name => ({ name, needs: ["fit", "price", "weight"] })) } : { recommendations: names.map((name, index) => ({ name, reason: "The confirmed comfort preference is supported by the catalog. Fit review evidence is mixed for a high instep, so try on. The current quoted price is within the specified budget, subject to availability.", pros: ["Documented cushioning"], cons: ["High-instep fit needs a try-on"], references: [{ title: `${name} Basketball performance review`, url: goodUrl(index, false) }, { title: `${name} Ultra V2 Basketball Review`, url: badUrl(index) }] })) };
  async function* chunks() { yield { choices: [{ delta: { content: JSON.stringify(output) }, finish_reason: "stop" }] }; }
  return chunks();
} } } } as unknown as OpenAI;
try {
  for (round = 0; round < 2; round++) {
    const result = await recommendOnboardingShoes(client, { shoes, history: [], currentInput, count: 2, model: PACKY_MODEL, replyLanguage: "en", researchFocus: pickerResearchFocus(answers), priceResearchFocus: pickerPriceResearchFocus(answers) }, event => progress.push(event));
    assert.deepEqual(result?.recommendations.map(rec => rec.name), names);
    assert(result?.recommendations.every(rec => rec.references?.length === 1 && !rec.references.some(ref => ref.url.includes("ultra"))), "Unsupported variant references must be removed even if the model returns them");
  }
  assert.equal(modelCalls, 4, "Each recommendation run has one shortlist and one final answer, with no further question round");
  assert.equal(calls.filter(call => call.kind === "search" && call.query?.includes("current price")).length, 4, "Current-price searches bypass the six-hour evidence cache");
  assert.equal(calls.filter(call => call.kind === "search" && !call.query?.includes("current price")).length, 2, "Repeat fit queries reuse valid evidence");
  assert(progress.some(event => event.type === "search" && event.state === "ok" && event.cached), "Cache reuse remains visible in progress");
} finally {
  globalThis.fetch = savedFetch;
  if (savedEnv.key === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = savedEnv.key;
  if (savedEnv.provider === undefined) delete process.env.WEB_SEARCH_PROVIDER; else process.env.WEB_SEARCH_PROVIDER = savedEnv.provider;
  if (savedEnv.bocha === undefined) delete process.env.BOCHA_API_KEY; else process.env.BOCHA_API_KEY = savedEnv.bocha;
}
console.log("PASS catalog shortlist → answer-specific exact-model research → detailed recommendations; live prices bypass cache; variant evidence is excluded; notes and corrections reach both model phases.");
