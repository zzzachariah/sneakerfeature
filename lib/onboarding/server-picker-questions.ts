import type OpenAI from "openai";
import type { DemoInput } from "./picker-demo-contract";
import { pickerQuestionSetSchema, pickerQuestionsPrompt, profileConfirmation, type PickerQuestionSet } from "./picker-questions";

/** One bounded model call; invalid output fails instead of posing canned questions as AI work. */
export async function generatePickerQuestions(client: OpenAI, model: string, input: DemoInput, names: string[]): Promise<PickerQuestionSet> {
  const response = await client.chat.completions.create({
    model, temperature: 0.2, max_tokens: 4000,
    messages: [{ role: "user", content: pickerQuestionsPrompt(input, names) }],
    response_format: { type: "json_object" }
  }, { timeout: 45_000, maxRetries: 0 });
  const content = response.choices[0]?.message.content;
  if (!content || response.choices[0]?.finish_reason === "length") throw new Error("incomplete_questions");
  const questions = pickerQuestionSetSchema.parse(JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")));
  // The confirmation repeats only the supplied facts, even if the model paraphrased incorrectly.
  questions.questions[0].prompt = profileConfirmation(input);
  return questions;
}
