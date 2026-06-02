import type OpenAI from "openai";
import { PACKY_MODEL } from "./packy-client";

// Summarizes a sneaker-reviewer's video transcript into a "two good, two bad"
// paraphrase ("转述式署名") plus a one-line overall take. Stays framework-free
// (no next/* imports) so BOTH the standalone ingestion script and the admin
// re-summarize route can import it. Reuses packyapi via the OpenAI SDK client
// the caller provides (createPackyClient()), same channel as shoe recommendation.

export type ReviewSummary = {
  // Chinese (authored language).
  pros: string[];
  cons: string[];
  summary: string;
  // English (rendered as-is on the English UI — never translated at runtime).
  pros_en: string[];
  cons_en: string[];
  summary_en: string;
};

const SYSTEM_PROMPT = `你是 sneakerfeature 的球鞋测评转述助手。下面会给你一段某位博主对某双球鞋的视频字幕文本。
请你把这段视频的核心观点，用「转述式署名」的方式重新表达——也就是用你自己的话概括博主的意思，
绝对不要逐字摘抄字幕原文（出于版权考虑），也不要编造视频里没有提到的内容。

请输出 JSON，包含六个字段（中文一套 + 对应的英文一套）：
1. pros：数组，正好 2 条中文优点，每条是视频里最突出的优点，用约 10 个汉字的简短短语转述（例如"前掌缓震很到位"）。
2. cons：数组，正好 2 条中文缺点/不足，同样约 10 个汉字的短语。
3. summary：一句话中文总体评价，约 20-30 个汉字，转述博主对这双鞋的整体看法。
4. pros_en：上面 2 条优点的英文版（自然、地道的英文，可意译，不必逐字直译）。
5. cons_en：上面 2 条缺点的英文版。
6. summary_en：summary 的英文版。

严格要求：
- 必须是这段视频里实际、最主要的观点；视频没强调的不要写。
- 不要逐字复制字幕里的句子；要改写、概括成你自己的话。
- 不要出现"博主说""视频里提到"这类前缀，直接写观点本身。
- 中文字段用简体中文，英文字段用英文；两套内容必须一一对应、含义一致。
- 只输出 JSON，不要 markdown、不要多余文字。格式：
  {"pros":["优点1","优点2"],"cons":["缺点1","缺点2"],"summary":"一句话总评","pros_en":["pro1","pro2"],"cons_en":["con1","con2"],"summary_en":"one-line verdict"}`;

// Cap so a long transcript can never blow the (haiku) context window.
const MAX_TRANSCRIPT = 12000;

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

// Coerce to exactly-2 clean, non-empty short strings.
function coerce2(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, 2);
}

// Reuses recommend.ts's parse approach: strip fences → JSON.parse → regex {…}
// salvage. Requires a complete Chinese {pros[2], cons[2], summary}; the English
// trio falls back to the Chinese values if the model omitted it, so the EN
// columns are never empty (admin can re-summarize/edit to improve them).
function parse(text: string): ReviewSummary | null {
  if (!text) return null;
  const tryOne = (raw: string): ReviewSummary | null => {
    try {
      const p = JSON.parse(raw) as {
        pros?: unknown; cons?: unknown; summary?: unknown;
        pros_en?: unknown; cons_en?: unknown; summary_en?: unknown;
      };
      const pros = coerce2(p.pros);
      const cons = coerce2(p.cons);
      const summary = typeof p.summary === "string" ? p.summary.trim() : "";
      if (!(pros.length === 2 && cons.length === 2 && summary)) return null;
      const prosEn = coerce2(p.pros_en);
      const consEn = coerce2(p.cons_en);
      const summaryEn = typeof p.summary_en === "string" ? p.summary_en.trim() : "";
      return {
        pros,
        cons,
        summary,
        pros_en: prosEn.length === 2 ? prosEn : pros,
        cons_en: consEn.length === 2 ? consEn : cons,
        summary_en: summaryEn || summary
      };
    } catch {
      return null;
    }
  };
  const direct = tryOne(stripFences(text));
  if (direct) return direct;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) return tryOne(match[0]);
  return null;
}

export async function summarizeBloggerReview(
  client: OpenAI,
  opts: { shoeName: string; bloggerName: string; transcript: string }
): Promise<ReviewSummary> {
  const transcript = (opts.transcript ?? "").slice(0, MAX_TRANSCRIPT);
  if (!transcript.trim()) throw new Error("summarize_failed: empty transcript");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `球鞋：${opts.shoeName}\n博主：${opts.bloggerName}\n\n` +
        `以下是视频字幕文本（可能含时间戳/噪音，请忽略无意义片段）：\n${transcript}`
    }
  ];
  const base = { model: PACKY_MODEL, temperature: 0.3, max_tokens: 600 };

  // packyapi's relay support is unknown, so try structured-output mechanisms in
  // order and use the first that yields a parseable {pros,cons,summary}.

  // 1) JSON mode — most widely supported OpenAI-compatible structured output.
  try {
    const c = await client.chat.completions.create({ ...base, messages, response_format: { type: "json_object" } });
    const out = c.choices?.[0]?.message?.content;
    if (typeof out === "string") {
      const r = parse(out);
      if (r) return r;
    }
  } catch {
    /* response_format unsupported — try the next strategy */
  }

  // 2) Assistant prefill — Claude continues the JSON object we started.
  try {
    const prefill = '{"pros":';
    const c = await client.chat.completions.create({
      ...base,
      messages: [...messages, { role: "assistant", content: prefill }]
    });
    const out = c.choices?.[0]?.message?.content;
    if (typeof out === "string") {
      const r = parse(prefill + out) ?? parse(out);
      if (r) return r;
    }
  } catch {
    /* prefill not accepted — try the next strategy */
  }

  // 3) Plain call — last resort; parse whatever comes back.
  const c = await client.chat.completions.create({ ...base, messages });
  const out = c.choices?.[0]?.message?.content;
  if (typeof out === "string") {
    const r = parse(out);
    if (r) return r;
  }
  throw new Error("summarize_failed: model did not return parseable {pros,cons,summary}");
}
