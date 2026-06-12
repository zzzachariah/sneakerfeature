import type OpenAI from "openai";
import { PACKY_MODEL } from "./packy-client";

// Translates a batch of English sneaker-content fields (tech specs, feel
// descriptors, editorial story) into natural Simplified Chinese in ONE call, via
// packyapi (same channel/model as shoe recommendation + review summarization).
//
// Used to pre-translate content into the `*_zh` columns so the Chinese UI reads
// them directly instead of machine-translating at render time. Crucially this is
// good enough to translate proprietary forefoot/heel midsole tech names (which we
// used to leave untranslated because runtime MT mangled them): the prompt keeps
// the tech/brand tokens intact and only renders the surrounding words in Chinese.
//
// Framework-free (no next/* imports) so the admin route AND any standalone script
// can both import it. The caller provides the client (createPackyClient()).

export type TranslatableField = { key: string; text: string };

// Cap each value (story content can be long) and the batch so one shoe can never
// blow the context window.
const MAX_FIELD_CHARS = 4000;

const SYSTEM_PROMPT = `你是 sneakerfeature 的球鞋内容翻译助手。把给定的英文球鞋内容（中底/外底/鞋面科技、脚感与性能描述、品牌故事）逐条翻译成自然、地道的简体中文，用于中文界面展示。

要求：
- 忠实原意，不增删信息、不编造、不解释。
- 保留专有科技/材料名的英文 token（如 Zoom Air、ZoomX、Air、React、Boost、Lightstrike、BOOM、䨻、Flightspeed、Cushlon、Pebax、Carbon、TPU 等），只把周围的描述词译成中文。例如 "Full-length Zoom Air" → "全掌 Zoom Air"，"Flight plate with Zoom Air forefoot" → "前掌搭载 Zoom Air 的 Flight Plate"。
- 品牌与球员名（Nike、adidas、Li-Ning、Anta、Jordan、Curry 等）保留通用译法或原文，不要逐字直译。
- 语气贴合球鞋测评，简洁专业；保持原文的大致长度，短语对短语、句子对句子。
- 每条只返回译文本身，不要加引号、编号或多余文字。

通过调用 submit_translations 函数提交结果：items 数组里每个元素的 key 必须与输入完全一致，zh 为该条对应的简体中文译文。`;

const TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "submit_translations",
    description: "提交各字段的简体中文译文",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string", description: "与输入完全一致的字段标识，原样返回" },
              zh: { type: "string", description: "该字段英文内容对应的简体中文译文" }
            },
            required: ["key", "zh"]
          }
        }
      },
      required: ["items"]
    }
  }
};

function buildUserMessage(fields: TranslatableField[]): string {
  const lines = fields.map(
    (f, i) => `[${i + 1}] key: ${f.key}\n英文：${f.text.slice(0, MAX_FIELD_CHARS)}`
  );
  return `请把下面每个字段的英文内容翻译成简体中文，保持每条的 key 不变、数量一致：\n\n${lines.join("\n\n")}`;
}

function collect(parsed: unknown, wanted: Set<string>): Record<string, string> {
  const out: Record<string, string> = {};
  const items = (parsed as { items?: unknown })?.items;
  if (!Array.isArray(items)) return out;
  for (const item of items) {
    const key = (item as { key?: unknown })?.key;
    const zh = (item as { zh?: unknown })?.zh;
    if (typeof key === "string" && wanted.has(key) && typeof zh === "string" && zh.trim()) {
      out[key] = zh.trim();
    }
  }
  return out;
}

function parseJson(raw: string, wanted: Set<string>): Record<string, string> {
  try {
    return collect(JSON.parse(raw), wanted);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return {};
    try {
      return collect(JSON.parse(m[0]), wanted);
    } catch {
      return {};
    }
  }
}

// One chat call, retrying transient upstream errors (403/408/429/5xx) with
// backoff — packyapi occasionally 403s under load (mirrors summarize-review).
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

// Returns a map of key → Chinese translation. Empty-text inputs are skipped, and
// any field the model fails to return is simply absent (caller leaves it null so
// the UI falls back to English). Throws only on a hard upstream failure so the
// bulk job can mark the shoe failed and move on.
export async function translateFieldsToZh(
  client: OpenAI,
  fields: TranslatableField[]
): Promise<Record<string, string>> {
  const nonEmpty = fields.filter((f) => f.key && typeof f.text === "string" && f.text.trim());
  if (nonEmpty.length === 0) return {};

  const wanted = new Set(nonEmpty.map((f) => f.key));
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserMessage(nonEmpty) }
  ];
  const base = { model: PACKY_MODEL, temperature: 0.2, max_tokens: 3000 };

  // 1) Forced tool call — the relay enforces the schema (most reliable).
  try {
    const msg = await createMessage(client, {
      ...base,
      messages,
      tools: [TOOL],
      tool_choice: { type: "function", function: { name: "submit_translations" } }
    });
    const args = msg?.tool_calls?.[0]?.function?.arguments;
    if (typeof args === "string") {
      const got = parseJson(args, wanted);
      if (Object.keys(got).length > 0) return got;
    }
    if (typeof msg?.content === "string") {
      const got = parseJson(msg.content, wanted);
      if (Object.keys(got).length > 0) return got;
    }
  } catch {
    /* tools unsupported / transient exhausted — fall through to plain JSON */
  }

  // 2) Plain call → JSON object in the content.
  const msg = await createMessage(client, {
    ...base,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          '只输出一个 JSON 对象，形如 {"items":[{"key":"...","zh":"..."}]}，key 与上面完全一致，不要任何其它文字。'
      }
    ]
  });
  if (typeof msg?.content === "string") {
    const got = parseJson(msg.content, wanted);
    if (Object.keys(got).length > 0) return got;
  }

  throw new Error(
    `translate_failed: unparseable output — ${(msg?.content ?? "(empty)").slice(0, 300)}`
  );
}
