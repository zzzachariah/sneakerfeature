import type OpenAI from "openai";
import { PACKY_MODEL } from "./packy-client";

// Summarizes a sneaker-reviewer's video transcript into a "two good, two bad"
// paraphrase ("转述式署名") plus a one-line overall take, in Chinese AND English.
// SCOPED TO THE TARGET SHOE: a single video often covers several shoes, brand
// chatter, hauls or sponsor reads — the prompt extracts ONLY what the reviewer
// says about THIS shoe, never a summary of the whole video.
// Stays framework-free (no next/* imports) so BOTH the standalone ingestion
// script and the admin re-summarize route can import it. Reuses packyapi via the
// OpenAI SDK client the caller provides (createPackyClient()), same channel as
// shoe recommendation.
//
// packyapi + haiku will NOT reliably emit JSON or follow a text template (it
// invents its own "标签:" tag-lists), so the primary path is a forced tool call
// — the relay enforces the function schema, the same mechanism recommend.ts
// uses. Text parsers (labeled lines / JSON) remain as fallbacks.

export type ReviewSummary = {
  // Whether the transcript is actually a review of the target shoe (AI-judged).
  // false → the caller should not publish it.
  relevant: boolean;
  // Chinese (authored language).
  pros: string[];
  cons: string[];
  summary: string;
  // English (rendered as-is on the English UI — never translated at runtime).
  pros_en: string[];
  cons_en: string[];
  summary_en: string;
};

const SYSTEM_PROMPT = `你是 sneakerfeature 的球鞋测评转述助手。下面会给你一段博主视频的字幕，以及本次要点评的目标球鞋名。
你的任务只针对「这双目标球鞋」：只提炼博主对这双鞋的评价，而不是概括整段视频。
很多视频会同时聊到别的鞋、品牌新闻、开箱闲聊、带货口播、上脚穿搭等——这些与这双鞋无关的内容一律忽略，只保留博主针对这双鞋说的优缺点和使用感受。

首先判断：这段字幕里博主是否确实在测评 / 实质性讨论这双目标球鞋？
- 如果整段几乎没讲这双鞋、讲的是别的鞋、只是顺带提一句鞋名、或与这双鞋无关：把 relevant 设为 false（优缺点可留空，不要硬凑）。
- 如果确实讲到了这双鞋：把 relevant 设为 true（视频里同时聊了别的鞋也算），再用你自己的话（转述，不逐字摘抄、不编造），只就这双鞋提炼
  2 个优点、2 个缺点，以及一句针对「这双鞋」（而非整段视频）的整体总评，并给出对应的英文版。
请调用 submit_review_summary 函数提交结果。`;

// Forced-tool schema — the reliable structured-output path.
const SUMMARY_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "submit_review_summary",
    description: "提交这双球鞋的转述式测评要点（中英双语）",
    parameters: {
      type: "object",
      properties: {
        relevant: {
          type: "boolean",
          description:
            "这段字幕里博主是否确实在测评或实质性讨论本次给定的这双球鞋。整段没讲这双鞋、只讲别的鞋、只是顺带提一句鞋名、或与该鞋无关都填 false；只要确实讲到了这双鞋（即便视频里也聊了别的鞋）就填 true。"
        },
        pros: {
          type: "array",
          items: { type: "string" },
          description: "正好 2 条中文优点，只取博主对「这双鞋」的评价（不要写别的鞋或视频里的无关内容），每条约 10 个汉字的短语，例如 前掌缓震很到位"
        },
        cons: {
          type: "array",
          items: { type: "string" },
          description: "正好 2 条中文缺点/不足，只取博主对「这双鞋」的评价，每条约 10 个汉字的短语"
        },
        summary: { type: "string", description: "一句话中文总评，针对「这双鞋」本身、而非概括整段视频，约 20-30 个汉字" },
        pros_en: { type: "array", items: { type: "string" }, description: "pros 的英文版，正好 2 条，自然地道" },
        cons_en: { type: "array", items: { type: "string" }, description: "cons 的英文版，正好 2 条" },
        summary_en: { type: "string", description: "summary 的英文版" }
      },
      required: ["relevant", "pros", "cons", "summary", "pros_en", "cons_en", "summary_en"]
    }
  }
};

// Cap so a long transcript can never blow the context window.
const MAX_TRANSCRIPT = 12000;

function coerce2(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => (typeof v === "string" ? v.trim() : "")).filter(Boolean).slice(0, 2);
}

// Build a ReviewSummary from a parsed object (tool args or JSON). English trio
// falls back to the Chinese values so the EN columns are never empty.
function fromObject(p: Record<string, unknown>): ReviewSummary | null {
  // Irrelevant videos: accept without requiring pros/cons (caller won't publish).
  if (p.relevant === false) {
    return { relevant: false, pros: [], cons: [], summary: "", pros_en: [], cons_en: [], summary_en: "" };
  }
  const pros = coerce2(p.pros);
  const cons = coerce2(p.cons);
  const summary = typeof p.summary === "string" ? p.summary.trim() : "";
  if (!(pros.length === 2 && cons.length === 2 && summary)) return null;
  const prosEn = coerce2(p.pros_en);
  const consEn = coerce2(p.cons_en);
  const summaryEn = typeof p.summary_en === "string" ? p.summary_en.trim() : "";
  return {
    relevant: true,
    pros,
    cons,
    summary,
    pros_en: prosEn.length === 2 ? prosEn : pros,
    cons_en: consEn.length === 2 ? consEn : cons,
    summary_en: summaryEn || summary
  };
}

function parseArgs(raw: string): ReviewSummary | null {
  try {
    return fromObject(JSON.parse(raw) as Record<string, unknown>);
  } catch {
    return null;
  }
}

// Strip markdown / quote / paren noise off a captured value.
function clean(s: string): string {
  return s
    .replace(/\*+/g, "")
    .replace(/^[-•\s"'「『（(]+/, "")
    .replace(/["'」』）)]+$/, "")
    .trim();
}

function lineValue(text: string, label: string): string {
  const m = text.match(new RegExp(`${label}\\s*\\**\\s*[:：]\\s*\\**\\s*(.+)`, "i"));
  return m ? clean(m[1]) : "";
}

// Fallback text parser: 10-line LABEL: value template, then a JSON object.
function parse(text: string): ReviewSummary | null {
  if (!text) return null;

  const prosZh = [lineValue(text, "PRO1_ZH"), lineValue(text, "PRO2_ZH")].filter(Boolean);
  const consZh = [lineValue(text, "CON1_ZH"), lineValue(text, "CON2_ZH")].filter(Boolean);
  const sumZh = lineValue(text, "SUM_ZH");
  if (prosZh.length === 2 && consZh.length === 2 && sumZh) {
    const prosEn = [lineValue(text, "PRO1_EN"), lineValue(text, "PRO2_EN")].filter(Boolean);
    const consEn = [lineValue(text, "CON1_EN"), lineValue(text, "CON2_EN")].filter(Boolean);
    const sumEn = lineValue(text, "SUM_EN");
    return {
      relevant: true,
      pros: prosZh,
      cons: consZh,
      summary: sumZh,
      pros_en: prosEn.length === 2 ? prosEn : prosZh,
      cons_en: consEn.length === 2 ? consEn : consZh,
      summary_en: sumEn || sumZh
    };
  }

  const fenced = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const direct = parseArgs(fenced);
  if (direct) return direct;
  const m = text.match(/\{[\s\S]*\}/);
  return m ? parseArgs(m[0]) : null;
}

// One chat call → message, retrying transient upstream errors (403/408/429/5xx)
// with backoff. packyapi occasionally 403s under load.
async function createMessage(
  client: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletionMessage | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const c = await client.chat.completions.create(params);
      return c.choices?.[0]?.message ?? null;
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
        `以下是视频字幕文本（可能含时间戳/噪音，请忽略无意义片段；若视频还聊到别的鞋或无关话题，只挑出与「${opts.shoeName}」有关的部分）：\n${transcript}`
    }
  ];
  const base = { model: PACKY_MODEL, temperature: 0.3, max_tokens: 2000 };

  // 1) Forced tool call — the relay enforces the schema (most reliable).
  try {
    const msg = await createMessage(client, {
      ...base,
      messages,
      tools: [SUMMARY_TOOL],
      tool_choice: { type: "function", function: { name: "submit_review_summary" } }
    });
    const args = msg?.tool_calls?.[0]?.function?.arguments;
    if (typeof args === "string") {
      const r = parseArgs(args);
      if (r) return r;
    }
    if (typeof msg?.content === "string") {
      const r = parse(msg.content);
      if (r) return r;
    }
  } catch {
    /* tools unsupported by the relay — fall back to text parsing */
  }

  // 2) Plain call → text parser (labeled lines / JSON).
  let msg = await createMessage(client, { ...base, messages });
  let r = msg?.content ? parse(msg.content) : null;
  if (r) return r;

  // 3) Corrective nudge.
  msg = await createMessage(client, {
    ...base,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "请用以下 10 行格式作答，每行保留开头的英文前缀原样，冒号后写答案，不要任何其它文字：\n" +
          "PRO1_ZH:\nPRO2_ZH:\nCON1_ZH:\nCON2_ZH:\nSUM_ZH:\nPRO1_EN:\nPRO2_EN:\nCON1_EN:\nCON2_EN:\nSUM_EN:"
      }
    ]
  });
  r = msg?.content ? parse(msg.content) : null;
  if (r) return r;

  throw new Error(`summarize_failed: unparseable output — ${(msg?.content ?? "(empty)").slice(0, 300)}`);
}
