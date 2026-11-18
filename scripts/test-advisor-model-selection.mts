import assert from "node:assert/strict";
import { build } from "esbuild";
import { DEFAULT_MODEL_CATALOG } from "../lib/ai/model-catalog";
import { MODEL_IDS, type Tier } from "../lib/subscription/tiers";

const chatId = "00000000-0000-4000-8000-000000000001";
type Event = [string, unknown?];
let events: Event[] = [];
let tier: Tier = "max";
let isAdmin = false;
let wrongOwner = false;
let signedIn = true;
let available = 600;
let failCatalog = false;
let failReply = false;
let reply = "Consider the fit before deciding.";
const db = {
  from(table: string) {
    const chain = {
      select() { return chain; }, eq() { return chain; }, order() { return chain; },
      insert(value: unknown) { events.push(["insert", value]); return chain; },
      update(value: unknown) { events.push(["update", value]); return chain; },
      async maybeSingle() {
        return { data: table === "advisor_chats" ? { id: chatId, user_id: wrongOwner ? "other" : "owner", title: "Conversation" } : {}, error: null };
      },
      async single() { return { data: { id: "saved-user", created_at: "now" }, error: null }; },
      then(resolve: (value: unknown) => void) { resolve({ data: [], error: null }); }
    };
    return chain;
  }
};
const mocks: Record<string, unknown> = {
  NextResponse: { json: (body: unknown, options?: ResponseInit) => Response.json(body, options) },
  getSmartPickerContext: async () => signedIn ? { userId: "owner", isAdmin } : null,
  createAdminClient: () => db,
  getMemberContext: async () => ({ tier, prefs: {} }),
  getAllowanceBalance: async () => available,
  getModelCatalog: async () => { if (failCatalog) throw Error("Unavailable"); return DEFAULT_MODEL_CATALOG; },
  getShoes: async () => [],
  createPackyClientForModel: (slot: string, actual: string) => { events.push(["client", { slot, actual }]); return {}; },
  clientOptionsForModel: () => ({}), getPackyEnvReport: () => ({}), describePackyEnvProblem: () => "Unavailable",
  startDeadline: () => ({ at: Date.now() + 270_000 }),
  streamAdvice: async (_client: unknown, opts: { model: string }, delta: (text: string) => void) => {
    events.push(["model", opts.model]);
    if (failReply) throw Error("Reply failed");
    if (reply) delta(reply);
    return { text: reply };
  },
  reserveAiRequest: async (_request: unknown, _userId: string, scope: string, billing: string, amount: number) => {
    events.push(["reserve", { scope, billing, amount }]);
    let complete = false;
    return {
      async complete(id: string, text: string, charged: number) {
        events.push(["complete", { id, text, charged }]); complete = true;
        return { id: "saved-assistant", created_at: "now", balance: available - charged };
      },
      async refund() { if (!complete) events.push(["refund"]); }
    };
  }
};
(globalThis as unknown as { __advisorMocks: unknown }).__advisorMocks = mocks;
const realModules = new Set(["@/lib/ai/model-catalog", "@/lib/subscription/tiers", "@/lib/persona/types", "@/lib/foot-scan/types"]);
const bundle = await build({
  entryPoints: [new URL("../app/api/ai/advisor/route.ts", import.meta.url).pathname],
  bundle: true, write: false, platform: "node", format: "esm",
  plugins: [{ name: "advisor-route-mocks", setup(b) {
    b.onResolve({ filter: /^(next\/server|@\/)/ }, args => {
      if (realModules.has(args.path) || !args.importer.endsWith("app/api/ai/advisor/route.ts")) return;
      return { path: args.path, namespace: "test" };
    });
    b.onLoad({ filter: /.*/, namespace: "test" }, () => ({
      contents: Object.keys(mocks).map(name => `export const ${name} = globalThis.__advisorMocks.${name};`).join("\n")
    }));
  } }]
});
const { POST } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const send = (model?: string) => POST(new Request("https://local.test/api/ai/advisor", {
  method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
  body: JSON.stringify({ chatId, message: "What should I look for?", ...(model === undefined ? {} : { model }) })
}));
const done = async (response: Response) => {
  assert.equal(response.status, 200);
  const body = await response.text();
  const frame = body.split("\n\n").find(value => value.startsWith("event: done\n"));
  assert.ok(frame, "The request should complete with a persisted reply");
  return JSON.parse(frame.split("\ndata: ")[1]) as { model: string; actualModel: string; billing: string; creditsCharged: number; balance: number; unlimited: boolean };
};
const reset = () => { events = []; tier = "max"; isAdmin = false; wrongOwner = false; signedIn = true; available = 600; failCatalog = false; failReply = false; reply = "Consider the fit before deciding."; };

// The visible selector determines the actual dynamic catalog model; Chat's
// existing one-credit allowance contract stays the same for every selection.
for (const [slot, actual] of [
  [MODEL_IDS.haiku, DEFAULT_MODEL_CATALOG.models.economy.model],
  [MODEL_IDS.deepseek, DEFAULT_MODEL_CATALOG.models.balanced.model],
  [MODEL_IDS.opus, DEFAULT_MODEL_CATALOG.models.flagship.model]
]) {
  reset();
  const result = await done(await send(slot));
  assert.equal(result.model, slot);
  assert.equal(result.actualModel, actual);
  assert.equal(result.billing, "allowance");
  assert.equal(result.creditsCharged, 1);
  assert.equal(result.balance, 599);
  assert.ok(events.some(([event, value]) => event === "model" && value === actual));
  assert.deepEqual(events.find(([event]) => event === "reserve")?.[1], { scope: "advisor", billing: "allowance", amount: 1 });
}

// Existing clients and invalid upstream names keep the flagship default.
for (const model of [undefined, "arbitrary-upstream-model", ""]) {
  reset();
  assert.equal((await done(await send(model))).model, MODEL_IDS.opus);
}

// UI consolidation must not grant Chat to Free/Pro or bypass chat ownership.
for (const memberTier of ["free", "pro"] as const) {
  reset(); tier = memberTier;
  assert.equal((await send(MODEL_IDS.haiku)).status, 403);
  assert.ok(!events.some(([event]) => event === "reserve" || event === "model"));
}
reset(); signedIn = false;
assert.equal((await send()).status, 403);
reset(); wrongOwner = true;
assert.equal((await send()).status, 404);
assert.ok(!events.some(([event]) => event === "reserve" || event === "model"));

// A lighter selected model must not quietly switch Chat to free/unlimited use.
reset(); available = 0;
assert.equal((await (await send(MODEL_IDS.haiku)).json()).insufficient, true);
assert.ok(!events.some(([event]) => event === "reserve" || event === "model"));

// Configuration failures and empty/failed responses do not spend allowance.
reset(); failCatalog = true;
assert.equal((await send()).status, 503);
assert.ok(!events.some(([event]) => event === "reserve"));
reset(); reply = "";
assert.equal((await done(await send())).creditsCharged, 0);
reset(); failReply = true;
const originalError = console.error;
try {
  console.error = () => {};
  assert.match(await (await send()).text(), /event: error/);
} finally { console.error = originalError; }
assert.ok(events.some(([event]) => event === "refund"));
assert.ok(!events.some(([event]) => event === "complete"));

reset(); isAdmin = true; tier = "free"; available = 0;
const adminReply = await done(await send(MODEL_IDS.deepseek));
assert.equal(adminReply.billing, "unlimited");
assert.equal(adminReply.creditsCharged, 0);
assert.equal(adminReply.unlimited, true);
assert.equal(adminReply.model, MODEL_IDS.deepseek);
console.log("Advisor model selection, ownership, entitlement and billing passed.");
