// Reply-language plumbing for the Smart Picker.
//
// The whole prompt scaffold in lib/ai/recommend.ts is written in Chinese, which
// biases every model on the relay to think AND answer in Chinese even when the
// user typed English. Language is therefore not a rendering concern we can fix
// in the UI — it has to be decided once per turn, from the user's own words, and
// then threaded through every string the pipeline emits: the priming assistant
// ack, the persona/foot-profile blocks, the per-tier depth suffix, the final
// instruction turns, and the route's own app-authored copy.
//
// `detectReplyLang` stays in derive-proscons.ts (its original home, imported by
// the deterministic pros/cons filler); this module re-exports it so callers have
// one place to reach for everything language-related.

export { detectReplyLang, type ReplyLang } from "@/lib/ai/derive-proscons";
import type { ReplyLang } from "@/lib/ai/derive-proscons";

/** Pick the variant matching the turn's reply language. */
export function pick(lang: ReplyLang, zh: string, en: string): string {
  return lang === "zh" ? zh : en;
}

/**
 * The unmissable language rule injected into every final-instruction turn.
 *
 * Written IN the target language: an English directive buried in a Chinese
 * prompt is far more likely to be honored than a Chinese sentence asking for
 * English. It names every field explicitly because the model reliably switched
 * `reply` to English while leaving `reason`/`pros`/`cons` in Chinese.
 */
export function languageDirective(lang: ReplyLang): string {
  return lang === "zh"
    ? "【语言 · 最高优先级】用户用中文提问，请全程用中文：思考过程(thinking/reasoning)、reply、follow_up、reason、pros、cons、title 全部中文。鞋款名称保留目录原文。"
    : "[LANGUAGE — HIGHEST PRIORITY] The user wrote in English, so EVERYTHING you produce must be in English: your reasoning/thinking stream, `reply`, `follow_up`, `title`, and every `reason`, `pros` and `cons` entry. These instructions happen to be written in Chinese — that is an implementation detail of this system, NOT the user's language, and it must not influence the language you think or write in. Chinese characters anywhere in your output are a failure of this turn. Shoe names, and technology names copied from the catalog, stay verbatim.";
}

/**
 * The priming assistant turn that acknowledges the catalog. This is the model's
 * OWN most recent words before the user's ask, so a Chinese ack was effectively
 * a running start into a Chinese answer — one of the strongest pulls toward the
 * wrong language. It now speaks whatever the user speaks.
 */
export function catalogAck(lang: ReplyLang): string {
  return lang === "zh"
    ? "明白，我已读取鞋款目录，请告诉我你的需求。"
    : "Understood — I've read the shoe catalog. Tell me what you're looking for, and I'll think and reply in English.";
}

/**
 * How the route annotates a past assistant turn with the shoes it recommended,
 * so a follow-up ("the first one is too expensive") has something to point at.
 */
export function alreadyRecommendedTag(lang: ReplyLang, names: string[]): string {
  return lang === "zh"
    ? `[已推荐: ${names.join(", ")}]`
    : `[Already recommended: ${names.join(", ")}]`;
}
