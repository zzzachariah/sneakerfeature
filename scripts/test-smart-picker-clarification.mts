import assert from "node:assert/strict";
import { build } from "esbuild";
import {
  clarificationOptions, clarificationQuestionsSchema, clarificationQuestionPrompt,
  clarificationRecommendationInput, clarificationResearchFocus, clarificationPriceFocus,
  groundedProfilePrompt, hasClarificationBudget, validateClarificationAnswers,
  type AiClarification, type ClarificationContext
} from "../lib/ai/clarification";

const context: ClarificationContext = {
  persona: { positions: ["PG"], skill_level: "amateur", height_cm: 180, weight_kg: 75, flat_foot: false },
  footProfile: null,
  ratingFocus: { primary: "traction", secondary: "court_feel", tertiary: "stability" }
};
const raw = {
  intro: { zh: "先确认需求。", en: "Let's confirm your needs." },
  questions: ["profile", "age", "fit", "budget"].map(id => ({ id, prompt: { zh: "请选择", en: "Choose one" }, reason: { zh: "影响选鞋", en: "This affects the choice" } }))
};
const parsed = clarificationQuestionsSchema.parse(raw);
const state: AiClarification = {
  id: "00000000-0000-4000-8000-000000000001", status: "awaiting_answers", ...parsed,
  questions: parsed.questions.map(q => ({ ...q, options: clarificationOptions(q.id) })),
  originalMessage: "I need shoes for outdoor basketball.", count: 5, model: "claude-sonnet-4-6",
  answers: { choices: { profile: "adjust", age: "any", fit: "wide", budget: "limit" }, note: "改为中锋，缓震优先，预算800元人民币。Private address 123 Secret Street." }
};
assert.equal(validateClarificationAnswers(state.questions, state.answers).note, state.answers!.note);
assert.throws(() => validateClarificationAnswers(state.questions, { choices: { ...state.answers!.choices, invented: "yes" }, note: "800 CNY" }));
assert.throws(() => validateClarificationAnswers(state.questions, { choices: { ...state.answers!.choices, fit: "invented" }, note: "800 CNY" }));
assert.throws(() => validateClarificationAnswers(state.questions, { choices: { ...state.answers!.choices, profile: "confirm" }, note: "800" }), /currency/);
assert.throws(() => validateClarificationAnswers(state.questions, { choices: state.answers!.choices, note: "" }), /correction/);
assert.throws(() => validateClarificationAnswers(state.questions, { choices: state.answers!.choices, note: "x".repeat(501) }));
assert.equal(hasClarificationBudget("under 120 USD"), true);
assert.equal(hasClarificationBudget("预算800元"), true);
assert.equal(hasClarificationBudget("800"), false);
assert.equal(hasClarificationBudget("USD"), false);
assert.throws(() => clarificationQuestionsSchema.parse({ ...raw, questions: raw.questions.slice(0, 3) }));
assert.throws(() => clarificationQuestionsSchema.parse({ ...raw, questions: [...raw.questions.slice(0, 3), raw.questions[2]] }));
const grounded = groundedProfilePrompt(state.originalMessage, context);
assert.match(grounded.en, /PG/);
assert.match(grounded.en, /Traction → Court feel → Stability/);
assert.match(grounded.zh, /抓地 → 场地感 → 稳定/);
assert.doesNotMatch(groundedProfilePrompt("Choose shoes", { persona: null, footProfile: null, ratingFocus: null }).en, /PG|wide|180|priority|priorities/);
const questionPrompt = clarificationQuestionPrompt(state.originalMessage, context);
assert.match(questionPrompt, /exactly four/);
assert.match(questionPrompt, /ask budget instead of repeating/);
assert.match(questionPrompt, /No recommendations, catalog reading, searches/);
assert.match(questionPrompt, /"height_cm":180/);
const input = clarificationRecommendationInput(state, "Actually prioritize stability now.", context);
assert.match(input, /Private address 123 Secret Street/);
assert.match(input, /"height_cm":180/);
assert.match(input, /"ratingFocus"/);
assert.match(input, /corrections and latest instructions override saved profile/);
assert.match(input, /Unknown remains unknown/);
assert.match(input, /empty follow_up/);
assert.match(input, /Actually prioritize stability now/);
assert.match(clarificationResearchFocus(state), /wide feet/);
assert.match(clarificationResearchFocus(state), /outdoor/);
assert.doesNotMatch(clarificationResearchFocus(state), /Secret|address|800|中锋/);
assert.equal(clarificationPriceFocus(state), "current price official retailer CNY");
for (const [note, code] of [["120美元", "USD"], ["120欧元", "EUR"], ["120澳元", "AUD"], ["120加元", "CAD"], ["800港元", "HKD"], ["800元人民币", "CNY"]]) {
  const focused = clarificationPriceFocus({ ...state, answers: { choices: state.answers!.choices, note } });
  assert.equal(focused, `current price official retailer ${code}`);
}
assert.equal(clarificationPriceFocus({ ...state, answers: { choices: { profile: "confirm", age: "unsure", fit: "unsure", court: "outdoor" }, note: "No extra details" } }), "");

const changed = { ...state, originalMessage: "Narrow fit, outdoor, budget 800 CNY", answers: { ...state.answers!, note: "Wide feet, indoor, 120 USD" } };
assert.equal(clarificationPriceFocus(changed), "current price official retailer USD");
assert.match(clarificationResearchFocus(changed), /wide feet.*indoor traction/);
assert.doesNotMatch(clarificationResearchFocus(changed), /narrow|outdoor/);
assert.equal(clarificationPriceFocus(changed, "Actually 150 EUR"), "current price official retailer EUR");
assert.equal(clarificationPriceFocus(changed, "My budget is $120"), "current price official retailer");
assert.equal(clarificationPriceFocus(changed, "预算120"), "current price official retailer");
assert.match(clarificationResearchFocus(changed, "Now narrow shoes for outdoor courts"), /narrow feet.*outdoor traction/);
assert.doesNotMatch(clarificationResearchFocus(changed, "Now narrow shoes for outdoor courts"), /wide|indoor/);

const combined = {...state,answers:{...state.answers!,choices:{...state.answers!.choices,fit:"wide"},note:"I also have a high instep and use my own insoles. 800 CNY"}};
assert.match(clarificationResearchFocus(combined), /wide feet.*high instep.*removable insole/);
assert.match(clarificationResearchFocus(combined,"Actually narrow feet"), /narrow feet.*high instep.*removable insole/);
assert.doesNotMatch(clarificationResearchFocus(combined,"Actually narrow feet"), /wide feet/);
assert.doesNotMatch(clarificationResearchFocus(combined,"No custom insoles"), /removable insole/);

// Exercise the real generation and reload-recovery functions without provider or DB traffic.
const bundle = await build({ entryPoints: [new URL("../lib/ai/clarification-server.ts", import.meta.url).pathname], bundle: true, write: false, platform: "node", format: "esm", plugins: [{ name: "no-external-effects", setup(b) {
  b.onResolve({ filter: /^(server-only|@\/lib\/supabase\/admin|\.\/reservations)$/ }, args => ({ path: args.path, namespace: "test" }));
  b.onLoad({ filter: /.*/, namespace: "test" }, args => ({ contents: args.path === "server-only" ? "" : args.path.includes("reservations") ? "export const reserveAiRequest=()=>{throw Error('No reservation expected')};" : "export const createAdminClient=()=>null;" }));
} }] });
const server = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
let calls = 0;
const client = { chat: { completions: { create: async (params: Record<string, unknown>) => {
  calls++;
  assert.equal(params.model, "claude-sonnet-runtime");
  assert.deepEqual(params.tool_choice, { type: "function", function: { name: "ask_clarifying_questions" } });
  return { choices: [{ message: { tool_calls: [{ type: "function", function: { name: "ask_clarifying_questions", arguments: JSON.stringify({ ...raw, questions: raw.questions.map((q, i) => i === 3 ? { ...q, id: "court" } : q) }) } }] } }] };
} } } };
const generated = await server.generateClarificationQuestions(client, "claude-sonnet-runtime", state.originalMessage, context);
assert.equal(calls, 1);
assert.equal(generated.questions[3].id, "budget", "Known outdoor use never asks the same court question again");
assert.deepEqual(generated.questions[0].prompt, grounded);

const row = { id: state.id, chat_id: "chat", user_id: "user", status: "answering", original_message: state.originalMessage, context, requested_count: 5, model: state.model, lang: "en", questions: raw, answers: state.answers, user_message_id: "user-message", assistant_message_id: "question-message", answer_message_id: "answer", request_id: "reservation", expires_at: new Date(Date.now() + 60_000).toISOString(), error: null };
let reservation: Record<string, unknown> = { result: { id: "settled-answer" }, status: "settled", expires_at: row.expires_at };
const updates: unknown[] = [];
const db = { from(table: string) { let updating = false; const chain = { select() { return chain; }, eq() { return chain; }, in() { return chain; }, update(value: unknown) { updates.push(value); updating = true; return chain; }, maybeSingle: async () => ({ data: table === "ai_chat_clarifications" ? row : reservation, error: null }), then(resolve: (value: unknown) => void) { resolve({ error: null, data: updating ? null : row }); } }; return chain; } };
assert.equal((await server.readChatClarification(db, "chat", "user")).status, "complete", "A settled receipt repairs metadata after a dropped transport");
row.status = "awaiting_answers";
assert.equal((await server.readChatClarification(db, "chat", "user")).status, "complete", "A lost settlement response cannot reopen a paid round");
row.status = "answering";
reservation = { result: null, status: "refunded", expires_at: row.expires_at };
const recovered = await server.readChatClarification(db, "chat", "user");
assert.equal(recovered.status, "awaiting_answers");
assert.deepEqual(recovered.answers, state.answers, "Retry keeps the same answers");
assert.ok(updates.length >= 2);
console.log("Smart Picker clarification: grounded questions, answers, notes, private-safe research, runtime model and reload recovery passed.");
