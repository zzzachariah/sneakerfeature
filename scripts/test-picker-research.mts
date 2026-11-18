import assert from "node:assert/strict";
import type OpenAI from "openai";
import type { Shoe } from "../lib/types";
import type { RecommendProgress } from "../lib/ai/types";
import { recommendOnboardingShoes } from "../lib/ai/recommend";
import { PACKY_MODEL, HAIKU_MODEL } from "../lib/ai/packy-client";
import { pickerAnswersContext, pickerResearchFocus, pickerPriceResearchFocus, type PickerAnswers, type PickerQuestionSet } from "../lib/onboarding/picker-questions";

type FixtureRequest = {
  model: string;
  messages: {content: string}[];
  tool_choice: {function: {name: string}};
  tools: {function: {parameters: {
    properties: {
      candidates: {items: {type: string}; minItems: number; maxItems: number};
      recommendations: {items: {properties: {reason: {description: string}}}};
    };
    required: string[];
  }}}[];
  parallel_tool_calls?: boolean;
  response_format?: {type: string};
};

const names = ["Probe Guard 1", "Probe Wing 2", "Probe Narrow 3"];
const selectedNames = names.slice(0, 2);
const shoes: Shoe[] = names.map((shoe_name, i) => ({
  id: `probe-${i}`, slug: `probe-${i}`, brand: "Test", shoe_name, release_year: i ? 2026 : 2014,
  weight: i ? "355g" : null,
  spec: { traction: "Good traction", stability: "Stable platform", fit: i === 2 ? "Narrow forefoot; instep pressure" : "Secure fit", cushioning_feel: "Comfortable cushioning", forefoot_midsole_tech: "Documented forefoot technology", upper_tech: "Documented knit upper", outsole_tech: "Documented rubber outsole", playstyle_summary: "Guard movement" }
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
  if (price) {
    assert.match(query, round === 4 ? /CNY/ : /USD/);
    assert.match(query, /\d{4}-\d{2}-\d{2}/);
    if (round === 4) assert.match(query, /人民币现价 官方店 在售/);
    else assert.doesNotMatch(query, /人民币现价/, "Do not infer CNY shopping context from language or other currencies");
  }
  else {
    assert.match(query, /wide feet/); assert.match(query, /high instep/);
    if (index === 0) assert.match(query, /measured weight/, "Missing candidate data should guide the probe");
    else assert.doesNotMatch(query, /measured weight/, "Known catalog weight need not be guessed or re-researched");
  }
  calls.push({ kind: "search", round, query });
  if (round === 4 && price && index === 1) return Response.json({results: [], usage: {credits: 1}});
  return Response.json({ results: [
    { title: `${names[index]} Ultra V2 Basketball Review`, url: badUrl(index), content: "UNSUPPORTED_VARIANT_EVIDENCE: different model details." },
    { title: `${names[index]} ${price ? "Basketball shoes retailer listing" : "Basketball performance review"}`, url: goodUrl(index, price), content: price
      ? round === 4 ? "Historical 2021 review: launch MSRP was 90 USD. No current retailer, CNY quote or stock information is supplied." : `Current quoted price is ${round ? 115 : 120} USD from Fixture Retailer; availability is not guaranteed.`
      : "Review reports forefoot room and instep pressure trade-offs for this exact shoe.", published_date: round === 4 && price ? "2021-01-01" : "2026-11-18" }
  ], usage: { credits: 1 } });
};
const client = { chat: { completions: { create: async (params: FixtureRequest) => {
  const phase = modelCalls++ % 2 === 0 ? "shortlist" : "final";
  calls.push({ kind: phase, round });
  const text = params.messages.map(message => message.content).join("\n");
  assert(text.includes(answers.note), "Both model phases must receive confirmed answers and additional input");
  if (params.model === HAIKU_MODEL) {
    assert.equal(params.tool_choice.function.name, phase === "shortlist" ? "shortlist_shoes" : "recommend_shoes");
    assert.equal(params.parallel_tool_calls, false);
    assert.equal(params.response_format, undefined, "Claude uses its native schema rather than prose-only JSON mode");
    if (phase === "shortlist") {
      const schema = params.tools[0].function.parameters;
      assert.equal(schema.properties.candidates.items.type, "string");
      assert.equal(schema.properties.candidates.minItems, round === 3 ? 2 : 3);
      assert.equal(schema.properties.candidates.maxItems, round === 3 ? 2 : 3);
      assert.deepEqual(schema.required, ["candidates", "backups", "research"]);
    } else {
      const reason = params.tools[0].function.parameters.properties.recommendations.items.properties.reason.description;
      assert.match(reason, /confirmed or corrected needs/);
      assert.match(reason, /current price is unverified/);
      assert.doesNotMatch(reason, /three ordered priorities/);
    }
  } else assert.equal(params.response_format?.type, "json_object", "Non-Claude JSON behavior is preserved");
  if (phase === "shortlist") {
    assert(text.includes('"year":2014'), "Older unselected models remain in the full catalog");
    assert(text.includes(JSON.stringify({ candidates: (round === 3 ? selectedNames : names).map((_, index) => `exact catalog name ${index + 1}`) }).slice(0, -1)));
    assert(text.includes(`Select exactly ${round === 3 ? 2 : 3} distinct plausible catalog models`));
    assert(text.includes('THIS STEP IS ONLY A PROVISIONAL SHORTLIST'));
    assert(text.includes('not to reject all otherwise plausible models'));
    assert.match(text, /deprioritize a narrow or tight fit for wide feet or a high instep/);
  } else {
    const liveSearches = calls.filter(call => call.kind === "search" && call.round === round);
    assert.equal(liveSearches.length, round === 0 ? 6 : round === 3 ? 2 : 3, "Cached fit evidence may be reused, but current-price probes must run each time");
    assert(text.includes("Documented forefoot technology") && text.includes("Documented knit upper") && text.includes("Documented rubber outsole"), "Final ranking receives detailed catalog facts");
    assert(text.includes('"weight":"355g"'));
    assert(text.includes(round ? "115 USD" : "120 USD"), "Final answer uses the latest retailer quote");
    assert(!text.includes("UNSUPPORTED_VARIANT_EVIDENCE") && !text.includes(badUrl(0)), "Other versions cannot become evidence for this base model");
    assert(text.includes("Published: 2026-11-18"));
    assert.match(text, /Corrections override the original profile/);
    assert.match(text, /Do not ask further questions/);
    assert.match(text, /EACH reason must state the current-price verification result/);
    assert.match(text, /Historical reviews, MSRP, old list prices, USD amounts or presumed discounts cannot establish a CNY budget/);
    assert.match(text, /Current CNY price is unverified/);
    assert.match(text, /Do not rationalize a known fit mismatch/);
    assert.match(text, /Cushioning materials do not establish outsole durability/);
    assert.match(text, /Qualitative catalog labels are not comparable lab tests/);
    assert.match(text, /Allowed reference URLs/);
    assert.match(text, /FIT\/PERFORMANCE REVIEW/);
    assert.match(text, /CURRENT-PRICE SEARCH — retrieved \d{4}-\d{2}-\d{2}/);
    assert.doesNotMatch(text, /REPLY MUST BE BROKEN UP|FOLLOW-UP GOES IN ITS OWN FIELD|differentiate `stars`|three ordered priorities|ALL THREE ordered priorities/, "The final demo contract must not inherit conflicting main SmartPicker directives");
  }
  const shortlist = round === 3 ? selectedNames : names;
  const output = phase === "shortlist" ? { candidates: shortlist, backups: [], research: shortlist.map(name => ({ name, needs: ["fit", "price", "weight"] })) } : { recommendations: selectedNames.map((name, index) => ({ name, reason: "The confirmed comfort preference is supported by the catalog. Fit review evidence is mixed for a high instep, so try on. The current quoted price is within the specified budget, subject to availability.", pros: ["Documented cushioning"], cons: ["High-instep fit needs a try-on"], references: [{ title: `${name} Basketball performance review`, url: goodUrl(index, false) }, { title: `${name} Ultra V2 Basketball Review`, url: badUrl(index) }, { title: `${selectedNames[1 - index]} Basketball performance review`, url: goodUrl(1 - index, false) }] })) };
  async function* chunks() {
    const json = JSON.stringify(output);
    if (params.model === HAIKU_MODEL) {
      // Real Claude output arrives through tool arguments, often with no text.
      // Split in the middle of a field and across the research array as SSE does.
      const toolName = phase === "shortlist" ? "shortlist_shoes" : "recommend_shoes";
      yield { choices: [{ delta: { tool_calls: [{ index: 0, id: `native-${phase}`, type: "function", function: { name: toolName, arguments: json.slice(0, 37) } }] } }] };
      yield { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: json.slice(37, 113) } }] } }] };
      yield { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: json.slice(113) } }] }, finish_reason: "tool_calls" }] };
    } else yield { choices: [{ delta: { content: json }, finish_reason: "stop" }] };
  }
  return chunks();
} } } } as unknown as OpenAI;
try {
  for (round = 0; round < 4; round++) {
    const result = await recommendOnboardingShoes(client, { shoes: round === 3 ? shoes.slice(0, 2) : shoes, history: [], currentInput, count: 2, model: round >= 2 ? HAIKU_MODEL : PACKY_MODEL, replyLanguage: "en", researchFocus: pickerResearchFocus(answers), priceResearchFocus: pickerPriceResearchFocus(answers) }, event => progress.push(event));
    assert.deepEqual(result?.recommendations.map(rec => rec.name), selectedNames);
    assert(result?.recommendations.every((rec, index) => rec.references?.length === 1 && rec.references[0].url === goodUrl(index, false)), "Unsupported variants and another candidate's references must be removed even if the model returns them");
  }
  assert.equal(modelCalls, 8, "Each recommendation run has one shortlist and one final answer, with no further question round");
  assert.equal(calls.filter(call => call.kind === "search" && call.query?.includes("current price")).length, 11, "Current-price searches bypass the six-hour evidence cache");
  assert.equal(calls.filter(call => call.kind === "search" && !call.query?.includes("current price")).length, 3, "Repeat fit queries reuse valid evidence");
  assert(progress.some(event => event.type === "search" && event.state === "ok" && event.cached), "Cache reuse remains visible in progress");

  // The real failure involved a CNY budget but only an old USD review price.
  // Verify the final and retry requests retain that distinction, including an
  // empty price search, without relying on a live model for semantic assertions.
  const cnyAnswers = {...answers, note: answers.note.replace("120 USD", "800 CNY")};
  const cnyInput = "PG / SG, original priorities traction, stability and fit." + pickerAnswersContext(questions, cnyAnswers, "zh");
  let cnyCalls = 0;
  const cnyClient = {chat:{completions:{create:async(params:FixtureRequest) => {
    const phase = cnyCalls++ === 0 ? "shortlist" : "final";
    calls.push({kind: phase, round});
    const text = params.messages.map(message => message.content).join("\n");
    assert(text.includes(cnyAnswers.note));
    assert.equal(params.tool_choice.function.name, phase === "shortlist" ? "shortlist_shoes" : "recommend_shoes");
    if (phase === "shortlist") {
      assert.equal(params.tools[0].function.parameters.properties.candidates.minItems, 3);
      assert.match(text, /Select exactly 3 distinct plausible catalog models/);
    } else {
      assert.match(text, /用户纠正优先于原档案/);
      assert.match(text, /每双 reason 都必须独立说明用户所给币种的现价核验结果/);
      assert.match(text, /当前人民币售价未核实，无法确认在预算内/);
      assert.match(text, /美元价格或推测折扣不能证明人民币预算成立/);
      assert.match(text, /不能用抓地或缓震好来合理化不合脚/);
      assert.match(text, /不能据此推出外底耐磨、抓地或寿命/);
      assert.match(text, /可引用 URL 白名单/);
      assert.match(text, /CURRENT-PRICE SEARCH — retrieved \d{4}-\d{2}-\d{2}/);
      assert.match(text, /historical prices are not current quotes/);
      assert.match(text, /Historical 2021 review: launch MSRP was 90 USD/);
      assert.match(text, /Published: 2021-01-01/);
      assert.match(text, /No usable exact-model evidence returned for this search/);
      assert.doesNotMatch(text, /请据此做 stars 差异化|reply 必须分段|三个有序重点|三个优先项/);
      assert.equal(calls.filter(call => call.kind === "search" && call.round === round).length, 3, "Only the three uncached CNY price probes should run");
      if (cnyCalls === 3) {
        const retry = params.messages.at(-2)?.content ?? "";
        assert.match(retry, /不要恢复已被纠正的原优先项/);
        assert.match(retry, /逐款保留其币种的现价核验结论或明确写现价未核实/);
      }
    }
    async function* chunks() {
      if (cnyCalls === 2) { yield {choices:[{delta:{content:""},finish_reason:"length"}]}; return; }
      const output = phase === "shortlist"
        ? {candidates: names, backups: [], research: names.map(name => ({name, needs:["fit", "price", "weight"]}))}
        : {recommendations:selectedNames.map(name=>({name,reason:"根据纠正后的需求考虑舒适性。宽脚和高脚背的适配仍需试穿。当前人民币售价未核实，无法确认在预算内。",pros:["目录有缓震资料"],cons:["人民币现价未核实"],references:[]}))};
      // A provider may still send ordinary JSON despite a native tool request.
      yield {choices:[{delta:{content:JSON.stringify(output)},finish_reason:"stop"}]};
    }
    return chunks();
  }}}} as unknown as OpenAI;
  const cnyResult = await recommendOnboardingShoes(cnyClient, {shoes,history:[],currentInput:cnyInput,count:2,model:HAIKU_MODEL,replyLanguage:"zh",researchFocus:pickerResearchFocus(cnyAnswers),priceResearchFocus:pickerPriceResearchFocus(cnyAnswers)});
  assert.equal(cnyCalls, 3, "A truncated final answer retries once without another shortlist or question round");
  assert.deepEqual(cnyResult?.recommendations.map(rec=>rec.name),selectedNames);

  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  const searchCount = calls.filter(call => call.kind === "search").length;
  const secret = "PRIVATE-CANDIDATE-MARKER-99";
  try {
    console.warn = (...args: unknown[]) => { warnings.push(args); };
    for (const output of [
      JSON.stringify({ candidates: [], backups: [], research: [] }),
      JSON.stringify({ candidates: [{ name: secret }], research: [] }),
      JSON.stringify({ candidates: [secret], backups: [], research: [] }),
      `malformed ${secret}`,
      JSON.stringify({ candidates: selectedNames, backups: [], research: [] })
    ]) {
      let attempts = 0;
      const invalidClient = {chat:{completions:{create:async(params:FixtureRequest) => {
        assert.equal(++attempts, 1, "Malformed shortlists must not invent picks or call the final model");
        assert.equal(params.tool_choice.function.name, "shortlist_shoes");
        async function* chunks() { yield {choices:[{delta:{tool_calls:[{index:0,id:"invalid-shortlist",type:"function",function:{name:"shortlist_shoes",arguments:output}}]},finish_reason:"tool_calls"}]}; }
        return chunks();
      }}}} as unknown as OpenAI;
      const result = await recommendOnboardingShoes(invalidClient, {shoes,history:[],currentInput,count:2,model:HAIKU_MODEL,replyLanguage:"en"});
      assert.equal(result, null, "Only actual model-selected catalog names can proceed to research");
      assert.equal(attempts, 1);
    }
  } finally { console.warn = originalWarn; }
  assert.equal(calls.filter(call => call.kind === "search").length, searchCount, "Invalid candidates never trigger evidence search");
  assert.equal(warnings.length, 5);
  assert(!JSON.stringify(warnings).includes(secret) && !JSON.stringify(warnings).includes(answers.note), "Diagnostics must not expose model output or user context");
  const diagnostics = warnings.map(([, details]) => details as Record<string, unknown>);
  assert(diagnostics.every(details => details.outputKind === "tool" && details.catalogCount === 3 && details.requiredCandidates === 3));
  assert.equal(diagnostics[1].objectEntries, 1);
  assert.equal(diagnostics[2].candidateNames, 1);
  assert.equal(diagnostics[3].parsed, false);
  assert.equal(diagnostics[4].matchedCandidates, 2, "A three-shoe catalog must not collapse to only two provisional choices before research");
} finally {
  globalThis.fetch = savedFetch;
  if (savedEnv.key === undefined) delete process.env.TAVILY_API_KEY; else process.env.TAVILY_API_KEY = savedEnv.key;
  if (savedEnv.provider === undefined) delete process.env.WEB_SEARCH_PROVIDER; else process.env.WEB_SEARCH_PROVIDER = savedEnv.provider;
  if (savedEnv.bocha === undefined) delete process.env.BOCHA_API_KEY; else process.env.BOCHA_API_KEY = savedEnv.bocha;
}
console.log("PASS three provisional candidates (two for a two-shoe catalog), fragmented Claude tool + JSON fallback, dedicated final/retry contracts, CNY historical-price uncertainty, live-price probes, and exact-model-only citations; invalid outputs fail without invented picks or sensitive logs.");
