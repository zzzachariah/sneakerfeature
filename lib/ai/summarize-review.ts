import type OpenAI from "openai";
import { PACKY_MODEL } from "./packy-client";

// Summarizes a sneaker-reviewer's video transcript into a "two good, two bad"
// paraphrase ("转述式署名") plus a one-line overall take, in Chinese AND English.
// Stays framework-free (no next/* imports) so BOTH the standalone ingestion
// script and the admin re-summarize route can import it. Reuses packyapi via the
// OpenAI SDK client the caller provides (createPackyClient()), same channel as
// shoe recommendation.
//
// packyapi + haiku reliably IGNORES "output JSON" and answers in chatty markdown
// prose, so instead of fighting for JSON we ask for a fixed 10-line
// "LABEL: value" template and parse those labels out of whatever (often
// preamble-prefixed) text comes back.

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

const SYSTEM_PROMPT = `你是 sneakerfeature 的球鞋测评转述助手。下面会给你一段博主对某双球鞋的视频字幕。
请用你自己的话概括博主的观点（转述，不要逐字摘抄字幕，也不要编造视频里没提到的内容），
提炼出这双鞋的 2 个优点(PRO) 和 2 个缺点(CON)，再写一句整体总评(SUM)。

然后严格按下面这 10 行输出。每行开头那个英文前缀（PRO1_ZH、PRO2_ZH 等）必须原样保留、
不要翻译、不要改成别的词；在冒号后面写你的答案，替换掉括号里的提示文字。
只输出这 10 行，不要任何前言、解释、编号或 markdown：

PRO1_ZH:（第1个优点，中文，约10个汉字的短语，例如 前掌缓震很到位）
PRO2_ZH:（第2个优点，中文短语）
CON1_ZH:（第1个缺点或不足，中文短语）
CON2_ZH:（第2个缺点，中文短语）
SUM_ZH:（一句话中文总评，约20-30个汉字）
PRO1_EN:（把 PRO1_ZH 翻成自然地道的英文）
PRO2_EN:（把 PRO2_ZH 翻成英文）
CON1_EN:（把 CON1_ZH 翻成英文）
CON2_EN:（把 CON2_ZH 翻成英文）
SUM_EN:（把 SUM_ZH 翻成英文）`;

// Cap so a long transcript can never blow the context window.
const MAX_TRANSCRIPT = 12000;

// Strip markdown / quote noise off a captured value.
function clean(s: string): string {
  return s
    .replace(/\*+/g, "")
    .replace(/^[-•\s"'「『（(]+/, "")
    .replace(/["'」』）)]+$/, "")
    .trim();
}

// Pull one "LABEL: value" line out of the text — tolerant of markdown bold and
// any preamble the chatty model prepends before the template.
function lineValue(text: string, label: string): string {
  const m = text.match(new RegExp(`${label}\\s*\\**\\s*[:：]\\s*\\**\\s*(.+)`, "i"));
  return m ? clean(m[1]) : "";
}

function coerce2(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean).slice(0, 2);
}

// Primary: the 10-line LABEL: value template. Fallback: a JSON object (in case a
// future model/relay does honor JSON). The English trio falls back to the
// Chinese values so the EN columns are never empty.
function parse(text: string): ReviewSummary | null {
  if (!text) return null;

  // 1) Labeled-line template.
  const prosZh = [lineValue(text, "PRO1_ZH"), lineValue(text, "PRO2_ZH")].filter(Boolean);
  const consZh = [lineValue(text, "CON1_ZH"), lineValue(text, "CON2_ZH")].filter(Boolean);
  const sumZh = lineValue(text, "SUM_ZH");
  if (prosZh.length === 2 && consZh.length === 2 && sumZh) {
    const prosEn = [lineValue(text, "PRO1_EN"), lineValue(text, "PRO2_EN")].filter(Boolean);
    const consEn = [lineValue(text, "CON1_EN"), lineValue(text, "CON2_EN")].filter(Boolean);
    const sumEn = lineValue(text, "SUM_EN");
    return {
      pros: prosZh,
      cons: consZh,
      summary: sumZh,
      pros_en: prosEn.length === 2 ? prosEn : prosZh,
      cons_en: consEn.length === 2 ? consEn : consZh,
      summary_en: sumEn || sumZh
    };
  }

  // 2) JSON fallback (strip fences → JSON.parse → regex {…} salvage).
  const tryJson = (raw: string): ReviewSummary | null => {
    try {
      const p = JSON.parse(raw) as Record<string, unknown>;
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
  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const direct = tryJson(fenced);
  if (direct) return direct;
  const m = text.match(/\{[\s\S]*\}/);
  return m ? tryJson(m[0]) : null;
}

// One chat call → message content, retrying transient upstream errors
// (403/408/429/5xx) with backoff. packyapi occasionally 403s under load.
async function createContent(
  client: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const c = await client.chat.completions.create(params);
      return c.choices?.[0]?.message?.content ?? null;
    } catch (e) {
      const status = (e as { status?: number })?.status;
      const transient =
        status === 403 || status === 408 || status === 429 || (typeof status === "number" && status >= 500);
      if (transient && attempt < 3) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt)); // 1s, 2s, 4s
        continue;
      }
      throw e;
    }
  }
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
  const base = { model: PACKY_MODEL, temperature: 0.3, max_tokens: 2000 };

  // Attempt 1: plain call. The parser tolerates any preamble the model adds.
  let out = await createContent(client, { ...base, messages });
  let r = out ? parse(out) : null;
  if (r) return r;

  // Attempt 2: corrective nudge (the model tends to add prose / markdown).
  out = await createContent(client, {
    ...base,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "请严格只输出那 10 行「标签: 内容」，第一行必须以 PRO1_ZH: 开头，" +
          "不要任何前言、解释、编号或 markdown 符号。"
      }
    ]
  });
  r = out ? parse(out) : null;
  if (r) return r;

  // Surface the raw output so a remaining failure is diagnosable from error_detail.
  throw new Error(`summarize_failed: unparseable output — ${(out ?? "(empty)").slice(0, 300)}`);
}
