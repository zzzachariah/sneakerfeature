import assert from "node:assert/strict";
import { build } from "esbuild";
import { clarificationOptions, type AiClarification } from "../lib/ai/clarification";

const chatId = "00000000-0000-4000-8000-000000000001";
const clarificationId = "00000000-0000-4000-8000-000000000002";
const requestId = "00000000-0000-4000-8000-000000000003";
const profile = { positions: ["PG"], skill_level: "amateur", flat_foot: false, height_cm: 180, weight_kg: 75 };
const state: AiClarification = {
  id: clarificationId, status: "awaiting_answers", originalMessage: "Outdoor shoes for me", count: 3, model: "saved-slot",
  intro: { zh: "先确认", en: "Confirm first" },
  questions: (["profile", "age", "fit", "budget"] as const).map(id => ({ id, prompt: { zh: "问题", en: "Question" }, reason: { zh: "原因", en: "Reason" }, options: clarificationOptions(id) })),
  answers: { choices: { profile: "adjust", age: "any", fit: "wide", budget: "limit" }, note: "I now play C. 800 CNY. private street address." }
};
const rowBase = { id: clarificationId, chat_id: chatId, status: "awaiting_answers", context: { persona: profile, footProfile: null, ratingFocus: { primary: "traction", secondary: "court_feel", tertiary: "stability" } }, original_message: state.originalMessage, requested_count: 3, model: state.model, lang: "en", answers: state.answers, assistant_message_id: "questions", answer_message_id: "answers" };
const shoes = [1, 2, 3].map(n => ({ id: `shoe${n}`, shoe_name: `Model ${n}`, slug: `shoe-${n}`, spec: {}, brand: "Test" }));
type Event = [string, unknown?];
let events: Event[] = [];
let row: typeof rowBase | null = null;
let history: unknown[] = [];
let balance = 0;
let failModel = false;
let emptyResult = false;
let wrongOwner = false;
let freshError = false;
let finalOptions: Record<string, unknown> | null = null;
const db = {
  from(table: string) {
    let inserted: unknown;
    let updated: unknown;
    const chain = {
      select() { return chain; }, eq() { return chain; }, order() { return chain; },
      insert(value: unknown) { inserted = value; events.push(["insert", value]); return chain; },
      update(value: unknown) { updated = value; events.push([`update:${table}`, value]); return chain; },
      maybeSingle: async () => ({ data: table === "ai_chats" ? { id: chatId, user_id: wrongOwner ? "another" : "owner", title: "Conversation" } : { persona: profile, rating_focus: rowBase.context.ratingFocus }, error: null }),
      single: async () => ({ data: { id: inserted ? "new-user-message" : "message" }, error: null }),
      then(resolve: (value: unknown) => void) { resolve({ data: updated ? null : table === "ai_messages" ? history : null, error: null }); }
    };
    return chain;
  },
  async rpc(name: string, args: Record<string, unknown>) {
    events.push([name, args]);
    if (name === "claim_ai_chat_clarification_answer") return { data: { claimed: true, row: { ...row, status: "answering", answer_message_id: "saved-answer" } }, error: null };
    throw Error(`Unexpected RPC ${name}`);
  }
};
const mocks: Record<string, unknown> = {
  NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) },
  getSmartPickerContext: async () => ({ userId: "owner", isAdmin: false }),
  createAdminClient: () => db,
  getShoes: async () => { events.push(["cached-catalog"]); return shoes; },
  getFreshPublicShoes: async () => { events.push(["fresh-catalog"]); if (freshError) throw Error("Unavailable"); return shoes; },
  readChatClarification: async () => row,
  publicClarification: (r: typeof rowBase) => ({ ...state, status: r.status }),
  clarificationResponse: async (_db: unknown, r: typeof rowBase) => ({ ok: true, clarification: true, userMessage: { id: "original" }, assistantMessage: { id: "questions", clarification: { ...state, status: r.status } } }),
  prepareChatClarification: async (args: unknown) => { events.push(["questions", args]); return { ok: true, clarification: true, assistantMessage: { clarification: state } }; },
  getPackyActualModel: (_client: unknown, initial: string) => initial,
  createPackyClientForModel: (slot: string, actual: string) => { events.push(["client", { slot, actual }]); return {}; },
  clientOptionsForModel: () => ({}), getPackyEnvReport: () => ({}), describePackyEnvProblem: () => "Unavailable",
  getModelCatalog: async () => ({}), catalogModel: (_catalog: unknown, slot: string) => ({ model: `runtime-${slot}` }),
  tierConfig: () => ({ prompt: { count: 3 }, baseModel: "base-slot", capabilities: { baseUnlimited: false } }),
  tierSupportsModel: () => true, isAllowanceMetered: () => false, resolveModelChoice: () => "default-slot",
  getMemberContext: async () => ({ tier: "free", prefs: {} }), getAllowanceBalance: async () => 100, getBalance: async () => balance,
  buildDepthSuffix: () => "tier instructions", startDeadline: () => ({ at: Date.now() + 270_000 }),
  getAllBloggerReviews: async () => { events.push(["reviews"]); return {}; },
  reserveAiRequest: async (_request: unknown, _user: string, _scope: string, billing: string, amount: number) => {
    events.push(["reserve", { billing, amount }]);
    let finalized = false;
    return { id: requestId, complete: async (...args: unknown[]) => { events.push(["complete", args]); finalized = true; return { id: "recommendation", balance: balance - Number(args[2]), credits_charged: args[2], created_at: "now" }; }, refund: async () => { if (!finalized) events.push(["refund"]); } };
  },
  recommendShoes: async (_client: unknown, opts: Record<string, unknown>) => { events.push(["recommend"]); finalOptions = opts; if (failModel) throw Error("model failure"); return { reply: "Verified recommendation", followUp: "Do not show this", recommendations: emptyResult ? [] : shoes.map(shoe => ({ name: shoe.shoe_name, stars: 4.5, reason: "Fit evidence", pros: ["Room"], cons: ["Try on"] })), loopExitReason: "success", searchStats: { succeeded: 1, attempts: 1, failures: [] } }; },
  matchShoeByName: (name: string) => shoes.find(shoe => shoe.shoe_name === name),
  enrichRecommendations: (items: unknown) => items,
  formatReplyParagraphs: (text: string) => text,
  deriveDetail: (input: { existing: unknown }) => input.existing,
  detectReplyLang: (input: string) => /[\u3400-\u9fff]/u.test(input) ? "zh" : "en",
  pick: (lang: string, zh: string, en: string) => lang === "zh" ? zh : en,
  alreadyRecommendedTag: () => "Previously recommended",
  pickFallbackShoes: () => { events.push(["fallback"]); return []; }
};
(globalThis as unknown as { __pickerMocks: unknown }).__pickerMocks = mocks;
const realModules = new Set(["@/lib/ai/clarification", "@/lib/persona/types", "@/lib/foot-scan/types", "@/lib/star-rating", "@/lib/ai/types", "@/lib/data/demo-shoes"]);
const bundle = await build({ entryPoints: [new URL("../app/api/ai/chat/route.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm", plugins: [{ name: "mock-route-dependencies", setup(b) {
  b.onResolve({ filter: /^(next\/server|@\/)/ }, args => {
    if (realModules.has(args.path) || !args.importer.endsWith("app/api/ai/chat/route.ts")) return;
    return { path: args.path, namespace: "test" };
  });
  b.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: Object.keys(mocks).map(name => `export const ${name} = globalThis.__pickerMocks.${name};`).join("\n") }));
} }] });
// Suppress the route's expected failure logs; data-URL stacks contain the bundle.
const originalWarn = console.warn, originalError = console.error;
console.warn = () => {}; console.error = () => {};
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const send = (answer = false, message = "Outdoor shoes for me", count = 8) => POST(new Request("https://local.test/api/ai/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chatId, message, count, model: "client-slot", ...(answer ? { clarification: { id: clarificationId, answers: state.answers } } : {}) }) }));
const reset = () => { events = []; finalOptions = null; failModel = false; emptyResult = false; freshError = false; wrongOwner = false; };

// New conversation and zero balance: only prepare the free question round.
let response = await send();
assert.equal((await response.json()).clarification, true);
assert.ok(events.some(([name]) => name === "questions"));
assert.ok(!events.some(([name]) => /catalog|reviews|reserve|recommend/.test(name)));
const questionArgs = events.find(([name]) => name === "questions")![1] as Record<string, unknown>;
assert.equal(questionArgs.count, 3);
assert.equal(questionArgs.actualModel, "runtime-client-slot");

// Reload or duplicate initial input reuses saved questions without model work.
reset(); row = { ...rowBase };
response = await send();
assert.equal((await response.json()).clarification, true);
assert.equal(events.length, 0);

// Retrying question generation keeps the saved count/model slot authoritative.
reset(); row = { ...rowBase, status: "failed" };
response = await send();
await response.json();
const retryArgs = events.find(([name]) => name === "questions")![1] as Record<string, unknown>;
assert.equal(retryArgs.model, "saved-slot");
assert.equal(retryArgs.actualModel, "runtime-saved-slot");
row = { ...rowBase };

// Confirmed answers ignore forged incoming count/model and fetch the current DB.
reset(); balance = 10;
response = await send(true);
const text = await response.text();
assert.match(text, /event: done/);
assert.ok(events.some(([name]) => name === "fresh-catalog"));
assert.ok(!events.some(([name]) => name === "cached-catalog" || name === "fallback"));
assert.equal(finalOptions!.count, 3);
assert.equal(finalOptions!.model, "runtime-saved-slot");
assert.equal(finalOptions!.replyLanguage, "en");
assert.equal(finalOptions!.confirmedPreferences, true);
assert.equal(finalOptions!.persona, null, "Old profile must not override a correction");
assert.match(String(finalOptions!.currentInput), /private street address/);
assert.match(String(finalOptions!.currentInput), /height_cm/);
assert.doesNotMatch(String(finalOptions!.researchFocus), /private|address/);
assert.doesNotMatch(String(finalOptions!.priceResearchFocus), /private|address/);
assert.equal(events.filter(([name]) => name === "complete").length, 1);
assert.match(text, /"followUp":""/);

// Persisted input survives a balance or live-catalog failure without a charge.
reset(); balance = 0;
response = await send(true);
assert.equal((await response.json()).insufficient, true);
assert.ok(events.some(([name]) => name === "update:ai_chat_clarifications"));
assert.ok(!events.some(([name]) => name === "reserve"));
reset(); balance = 10; freshError = true;
response = await send(true);
assert.equal(response.status, 503);
assert.ok(events.some(([name]) => name === "update:ai_chat_clarifications"));
assert.ok(!events.some(([name]) => name === "reserve"));

// Model failures and empty matches refund and restore answers, never pad picks.
for (const mode of ["throw", "empty"]) {
  reset(); failModel = mode === "throw"; emptyResult = mode === "empty";
  response = await send(true);
  assert.match(await response.text(), /event: error/);
  assert.ok(events.some(([name]) => name === "refund"));
  assert.ok(!events.some(([name]) => name === "fallback" || name === "complete"));
  assert.ok(events.some(([name, payload]) => name === "update:ai_chat_clarifications" && (payload as { status?: string }).status === "awaiting_answers"));
}

// Settled clarified chats retain needs, but later messages do not ask again.
reset(); row = { ...rowBase, status: "complete" }; history = [{ role: "assistant", content: "Picks", recommendations: [{ shoe_id: "shoe1" }] }];
response = await send(false, "Now prioritize stability", 2);
await response.text();
assert.equal(finalOptions!.count, 2);
assert.equal(finalOptions!.confirmedPreferences, true);
assert.match(String(finalOptions!.currentInput), /Now prioritize stability/);
assert.ok(!events.some(([name]) => name === "questions"));

// Existing recommendations from before this feature keep their direct flow.
reset(); row = null;
response = await send(false, "The first pair costs too much", 1);
await response.text();
assert.equal(finalOptions!.confirmedPreferences, false);
assert.ok(events.some(([name]) => name === "cached-catalog"));
assert.ok(!events.some(([name]) => name === "questions"));
reset(); wrongOwner = true;
response = await send();
assert.equal(response.status, 404);
assert.equal(events.length, 0);
console.warn = originalWarn; console.error = originalError;
console.log("Smart Picker API: free first round, reload, authoritative count/model, fresh catalog, language, correction precedence, retries, followups and ownership passed.");
