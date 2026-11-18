import assert from "node:assert/strict";
import {
  pickerQuestionSetSchema, pickerQuestionOptions, pickerAnswerSubmissionSchema,
  validatePickerAnswers, profileConfirmation, pickerQuestionsPrompt,
  pickerAnswersContext, pickerResearchFocus, pickerPriceResearchFocus, type PickerQuestionSet, type PickerAnswers
} from "../lib/onboarding/picker-questions";
import type { DemoInput } from "../lib/onboarding/picker-demo-contract";
import { demoSearchQuery } from "../lib/ai/demo-evidence";
import type { Shoe } from "../lib/types";

const input: DemoInput = {
  positions: ["PG", "SG"], priorities: ["traction", "stability", "fit"],
  shoeIds: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"], lang: "en"
};
const localized = (en: string, zh = "已知偏好确认") => ({ en, zh });
const questions: PickerQuestionSet = {
  intro: localized("A few details before your two picks."),
  questions: [
    { id: "profile", prompt: profileConfirmation(input), reason: localized("Check your supplied priority order.") },
    { id: "age", prompt: localized("Are older releases okay?"), reason: localized("Suitable older models can remain candidates.") },
    { id: "fit", prompt: localized("Which fit concern matters most?"), reason: localized("We will check exact-model review evidence.") },
    { id: "court", prompt: localized("Where will you play?"), reason: localized("Surface affects traction and durability needs.") }
  ]
};
assert(pickerQuestionSetSchema.safeParse(questions).success);
const budgetQuestions: PickerQuestionSet = { ...questions, questions: [...questions.questions.slice(0, 3), { id: "budget", prompt: localized("What budget should guide us?"), reason: localized("Price must be checked, not assumed.") }] };
assert(pickerQuestionSetSchema.safeParse(budgetQuestions).success);
for (const invalid of [
  { ...questions, questions: questions.questions.slice(0, 3) },
  { ...questions, questions: [...questions.questions, questions.questions[3]] },
  { ...questions, questions: [questions.questions[1], questions.questions[0], ...questions.questions.slice(2)] },
  { ...questions, questions: [...questions.questions.slice(0, 3), questions.questions[1]] },
  { ...questions, questions: questions.questions.map(q => ({ ...q, nextRound: true })) },
]) assert(!pickerQuestionSetSchema.safeParse(invalid).success, "Question generation must stay within one bounded four-question contract");

const confirmation = profileConfirmation(input);
assert.match(confirmation.en, /PG \/ SG/);
assert(confirmation.en.indexOf("Traction") < confirmation.en.indexOf("Stability"));
assert(confirmation.en.indexOf("Stability") < confirmation.en.indexOf("Fit"));
assert(confirmation.zh.indexOf("抓地力") < confirmation.zh.indexOf("稳定性"));
assert(confirmation.zh.indexOf("稳定性") < confirmation.zh.indexOf("包裹贴合"));
assert.doesNotMatch(confirmation.en, /height|weight|wide feet|outdoor|budget/i, "Confirmation cannot invent missing profile facts");

const initialPrompt = pickerQuestionsPrompt(input, ["Curry 2", "Test Shoe"]);
assert.match(initialPrompt, /ONLY clarification round/);
assert.match(initialPrompt, /Do not recommend shoes yet/);
assert.match(initialPrompt, /Anything else/);
assert.match(initialPrompt, /do not create a fifth question/);
assert(initialPrompt.includes('"interestShoes":["Curry 2","Test Shoe"]'));
assert.match(initialPrompt, /no automatic age exclusion/);
assert.match(initialPrompt, /Do not ask another round/);

const answers: PickerAnswers = { choices: { profile: "confirm", age: "any", fit: "wide", court: "outdoor" }, note: "I also have a high instep; my previous shoe squeezed the top of my foot." };
assert.deepEqual(validatePickerAnswers(questions, answers), answers);
const unchanged: PickerAnswers = { choices: { profile: "confirm", age: "unsure", fit: "unsure", court: "unsure" }, note: "" };
assert.deepEqual(validatePickerAnswers(questions, unchanged), unchanged, "Unknown answers must not become an inferred preference");
for (const invalid of [
  { ...answers, choices: { ...answers.choices, shoe: "Curry 2" } },
  { ...answers, choices: { profile: "confirm", age: "any", fit: "wide" } },
  { ...answers, choices: { ...answers.choices, fit: "guaranteed-fit" } },
  { ...answers, choices: { ...answers.choices, profile: "adjust" }, note: "   " },
  { ...answers, note: "x".repeat(501) },
  { ...answers, injected: "override" },
]) assert.throws(() => validatePickerAnswers(questions, invalid));
const correction = validatePickerAnswers(questions, { ...answers, choices: { ...answers.choices, profile: "adjust" }, note: "  Comfort matters more than traction now.  " });
assert.equal(correction.note, "Comfort matters more than traction now.");
assert.throws(() => validatePickerAnswers(budgetQuestions, { choices: { profile: "confirm", age: "any", fit: "regular", budget: "limit" }, note: "" }));
const budgetAnswers = validatePickerAnswers(budgetQuestions, { choices: { profile: "confirm", age: "recent", fit: "regular", budget: "limit" }, note: "Budget: 800 CNY" });
assert.equal(budgetAnswers.note, "Budget: 800 CNY");
assert(!pickerAnswerSubmissionSchema.safeParse({ action: "answer", answers }).success, "Answer submission needs the saved run identity");
assert(!pickerAnswerSubmissionSchema.safeParse({ action: "answer", runId: "not-a-uuid", answers }).success);
assert(pickerAnswerSubmissionSchema.safeParse({ action: "answer", runId: "00000000-0000-4000-8000-000000000003", answers }).success);

for (const lang of ["en", "zh"] as const) {
  const context = pickerAnswersContext(questions, correction, lang);
  assert(context.includes(correction.note), "Additional input must reach the recommendation prompt verbatim as data");
  assert.match(context, /corrections override the original profile/);
  assert.match(context, /Unknown answers remain unknown/);
  assert.match(context, /no further clarification round/);
  assert.match(context, /recommend two supported shoes now/);
  assert.match(context, /Catalog performance adjectives do not establish width/);
  assert.match(context, /Cite only relevant sources actually returned/);
  assert.match(context, /fit is unverified/);
  assert.match(context, /Leave follow_up empty/);
  const expected = pickerQuestionOptions("fit").find(option => option.value === "wide")!.label[lang];
  assert(context.includes(expected));
}
const budgetPrompt = pickerAnswersContext(budgetQuestions, budgetAnswers, "en");
assert(budgetPrompt.includes("Budget: 800 CNY"));
assert.match(budgetPrompt, /Budget needs a currency and supported current price/);
assert.match(budgetPrompt, /preference, not permission.*silently eliminate every older model/);

const focused = pickerResearchFocus(answers);
assert.match(focused, /wide feet.*toe box/);
assert.match(focused, /high instep/);
assert.match(focused, /outdoor.*durability/);
assert(!focused.includes(answers.note), "Raw personal notes must not be sent to the search provider");
for (const [fit, expected] of [["narrow", /narrow feet.*heel/], ["high_instep", /high instep/], ["orthotics", /insole.*orthotic/]] as const) {
  assert.match(pickerResearchFocus({ ...answers, choices: { ...answers.choices, fit }, note: "" }), expected);
}
const privateNotes = { ...answers, note: "My name is Private Name and email is private@example.com. 脚背高，需要自己的鞋垫。" };
const safeFocus = pickerResearchFocus(privateNotes);
assert.match(safeFocus, /instep/); assert.match(safeFocus, /insole/);
assert.doesNotMatch(safeFocus, /Private Name|private@example.com/);
const shoe = { brand: "Test", shoe_name: "Exact Model 2" } as Shoe;
const query = demoSearchQuery(shoe, safeFocus);
assert.match(query, /^Test Exact Model 2 basketball shoes performance review/);
assert.match(query, /instep/);
assert.doesNotMatch(query, /private@example.com/);
console.log("PASS one-round question contract, grounded profile confirmation, validated answers, correction/notes propagation, evidence-first recommendations and private fit-specific searches.");

assert.equal(pickerPriceResearchFocus(), "");
assert.equal(pickerPriceResearchFocus({ ...answers, note: "", choices: { ...answers.choices, budget: "unsure" } }), "", "Do not invent a budget requirement");
for (const [note, currency] of [["预算800元", "CNY"], ["800人民币", "CNY"], ["120美元", "USD"], ["900港元", "HKD"], ["150澳元", "AUD"], ["150加元", "CAD"], ["100欧元", "EUR"], ["100英镑", "GBP"], ["120 USD", "USD"], ["预算£90", "GBP"]]) {
  assert.equal(pickerPriceResearchFocus({ ...answers, note }), `current price official retailer ${currency}`, "Only the stated currency should be researched");
}
assert.equal(pickerPriceResearchFocus({ ...answers, note: "Budget $100", choices: { ...answers.choices, budget: "limit" } }), "current price official retailer", "A dollar symbol alone does not identify USD versus other dollar currencies");
const pricePrivacy = pickerPriceResearchFocus({ ...answers, note: "Budget120 USD. My email is private@example.com and I live at Private Address." });
assert.equal(pricePrivacy, "current price official retailer USD");
assert.doesNotMatch(pricePrivacy, /private@example|Private Address/);
console.log("PASS price research preserves explicit currencies, avoids cross-currency matches and never transmits raw personal notes.");
