import type OpenAI from "openai";
import type { Shoe } from "@/lib/types";
import type { RecommendationItem, RecommendationRaw } from "@/lib/ai/types";
import type { Persona } from "@/lib/persona/types";
import { computeMatchScore } from "@/lib/match/score";
import { normalizeSearchText, rankShoeMatch } from "@/lib/search/shoe-search";
import { PACKY_MODEL } from "@/lib/ai/packy-client";

export type ChatTurn = { role: "user" | "assistant"; content: string };

// What the model returns (name-based); we resolve names to catalog shoes ourselves.
export type ParsedRec = { name: string; stars: number; reason: string };

export type RecommendResult = {
  reply: string;
  recommendations: ParsedRec[];
  raw?: string;
};

const SYSTEM_PROMPT = `你是 SNKR Feature 的专业篮球鞋推荐顾问。你只能从下方「鞋款目录」(JSON 数组) 中挑选球鞋，绝不能编造目录里没有的鞋，也不要使用目录之外的网络知识。

用户随后会给出「本次要求」和需要推荐的数量 N，可能还会给出「球员档案」。请：
1. 自行理解「本次要求」的真实意图——中英文、口语、同义词、跨品牌的科技等价你都要靠自己的知识理解（例如"气垫/airsole"指 Zoom Air、Boost 等中底科技；"抓地"指 traction），不要拘泥字面、不要被某几个关键词限制。
2. 在目录里找出最匹配的鞋（用目录里每双鞋的 name 字段作为它的名称）。
3. 若提供了「球员档案」（位置/水平/扁平足/身高/体重，以及每双鞋的 personaFit 0-99），据此个性化：后卫→低帮/灵活/场地感；内线→缓震足/支撑/抗扭；扁平足→更强稳定与足弓支撑；体重大→更强缓震与支撑；初学者→容错，半职业/职业→响应。本次要求优先，档案为辅。
4. 对每双鞋给出：name（球鞋名称，必须与目录里的 name 尽量一致）、stars（推荐指数，1-5 的数字，可用 0.5，越靠前越高）、reason（一句话推荐理由，引用具体配置）。

输出 N 双，按推荐指数从高到低排序。尽量凑满 N 双；只要目录里有沾边的就返回最接近的。不要返回空列表，除非目录里没有任何篮球鞋。全部用用户的语言（默认中文）。`;

const SKILL_LABEL_ZH: Record<string, string> = {
  beginner: "初学者",
  amateur: "业余",
  semi_pro: "半职业",
  pro: "职业"
};

function formatPersona(persona: Persona): string {
  const skill = SKILL_LABEL_ZH[persona.skill_level] ?? persona.skill_level;
  return `位置=${persona.positions.join("/")}；水平=${skill}；扁平足=${persona.flat_foot ? "是" : "否"}；身高=${persona.height_cm}cm；体重=${persona.weight_kg}kg`;
}

function buildCompactCatalog(shoes: Shoe[], persona?: Persona | null) {
  return shoes.map((shoe) => {
    const spec = shoe.spec ?? {};
    const entry: Record<string, unknown> = {
      name: shoe.shoe_name,
      brand: shoe.brand
    };
    if (shoe.model_line) entry.model_line = shoe.model_line;
    if (shoe.version_name) entry.version = shoe.version_name;
    if (shoe.category) entry.category = shoe.category;
    if (shoe.player) entry.player = shoe.player;
    if (shoe.release_year) entry.year = shoe.release_year;
    if (shoe.weight) entry.weight = shoe.weight;
    if (spec.forefoot_midsole_tech) entry.forefoot_midsole = spec.forefoot_midsole_tech;
    if (spec.heel_midsole_tech) entry.heel_midsole = spec.heel_midsole_tech;
    if (spec.outsole_tech) entry.outsole = spec.outsole_tech;
    if (spec.upper_tech) entry.upper = spec.upper_tech;
    if (spec.cushioning_feel) entry.cushioning_feel = spec.cushioning_feel;
    if (spec.court_feel) entry.court_feel = spec.court_feel;
    if (spec.bounce) entry.bounce = spec.bounce;
    if (spec.stability) entry.stability = spec.stability;
    if (spec.traction) entry.traction = spec.traction;
    if (spec.fit) entry.fit = spec.fit;
    if (spec.playstyle_summary) entry.playstyle = spec.playstyle_summary;
    if (spec.tags?.length) entry.tags = spec.tags;
    if (persona) entry.personaFit = computeMatchScore(persona, shoe);
    return entry;
  });
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

function coerceStars(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 3;
  return Math.min(5, Math.max(1, n));
}

function parseResult(text: string): RecommendResult {
  const empty: RecommendResult = { reply: "", recommendations: [] };
  if (!text) return empty;

  const tryParse = (raw: string): RecommendResult | null => {
    try {
      const parsed = JSON.parse(raw) as { reply?: unknown; recommendations?: unknown };
      const reply = typeof parsed.reply === "string" ? parsed.reply : "";
      const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      const recommendations: ParsedRec[] = recs
        .map((rec) => {
          const r = rec as { name?: unknown; shoe_name?: unknown; stars?: unknown; reason?: unknown; summary?: unknown };
          const name =
            typeof r.name === "string" ? r.name : typeof r.shoe_name === "string" ? r.shoe_name : "";
          const reason =
            typeof r.reason === "string" && r.reason.trim()
              ? r.reason
              : typeof r.summary === "string"
                ? r.summary
                : "";
          return { name: name.trim(), stars: coerceStars(r.stars), reason: reason.trim() };
        })
        .filter((rec) => rec.name);
      return { reply, recommendations };
    } catch {
      return null;
    }
  };

  const direct = tryParse(stripFences(text));
  if (direct) return direct;

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    const salvaged = tryParse(match[0]);
    if (salvaged) return salvaged;
  }
  return empty;
}

// Resolve a model-provided shoe name to a catalog shoe. Uses rankShoeMatch
// (exact / substring / all-tokens), with a lenient "catalog name contained in
// the model name" fallback for extra words (e.g. an added brand or "Low").
export function matchShoeByName(name: string, shoes: Shoe[]): Shoe | null {
  const q = normalizeSearchText(name);
  if (!q) return null;

  let best: Shoe | null = null;
  let bestScore = -1;
  for (const shoe of shoes) {
    const s = rankShoeMatch(shoe, name);
    if (s > bestScore) {
      bestScore = s;
      best = shoe;
    }
  }
  if (bestScore >= 60 && best) return best;

  let fallback: Shoe | null = null;
  let fallbackLen = 0;
  for (const shoe of shoes) {
    const sn = normalizeSearchText(shoe.shoe_name);
    if (sn.length >= 4 && q.includes(sn) && sn.length > fallbackLen) {
      fallbackLen = sn.length;
      fallback = shoe;
    }
  }
  return fallback;
}

const RECOMMEND_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "recommend_shoes",
    description: "返回给用户的球鞋推荐列表（按推荐指数从高到低排序）",
    parameters: {
      type: "object",
      properties: {
        reply: { type: "string", description: "用用户的语言写的一句总结" },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "球鞋名称，必须与目录里的 name 尽量一致" },
              stars: { type: "number", description: "推荐指数 1-5，可用 0.5" },
              reason: { type: "string", description: "一句话推荐理由" }
            },
            required: ["name", "stars", "reason"]
          }
        }
      },
      required: ["recommendations"]
    }
  }
};

async function callModel(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<{ text: string; raw: string }> {
  // Primary: forced tool call → structured JSON args (most reliable for Claude).
  try {
    const c = await client.chat.completions.create({
      model: PACKY_MODEL,
      temperature: 0.3,
      max_tokens: 2000,
      messages,
      tools: [RECOMMEND_TOOL],
      tool_choice: { type: "function", function: { name: "recommend_shoes" } }
    });
    const msg = c.choices?.[0]?.message;
    const args = msg?.tool_calls?.[0]?.function?.arguments;
    if (typeof args === "string" && args.trim()) return { text: args, raw: args };
    if (typeof msg?.content === "string" && msg.content.trim()) return { text: msg.content, raw: msg.content };
  } catch {
    // Relay may not support tools — fall back to a plain call.
  }

  const c = await client.chat.completions.create({
    model: PACKY_MODEL,
    temperature: 0.3,
    max_tokens: 2000,
    messages
  });
  const content = c?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    const snippet = JSON.stringify(c ?? {}).slice(0, 300);
    throw new Error(
      `上游返回了非预期响应（缺少 choices/content）——通常是 Base URL 路径不对（应以 /v1 结尾）或上游报错。响应片段：${snippet}`
    );
  }
  return { text: content, raw: content };
}

export async function recommendShoes(
  client: OpenAI,
  opts: { shoes: Shoe[]; history: ChatTurn[]; currentInput: string; count: number; persona?: Persona | null }
): Promise<RecommendResult> {
  const catalog = buildCompactCatalog(opts.shoes, opts.persona);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n鞋款目录(JSON):\n${JSON.stringify(catalog)}` }
  ];
  for (const turn of opts.history) {
    if (turn.role === "user") messages.push({ role: "user", content: turn.content });
    else messages.push({ role: "assistant", content: turn.content });
  }
  const personaSuffix = opts.persona ? `\n\n我的球员档案：${formatPersona(opts.persona)}` : "";
  messages.push({ role: "user", content: `现在推荐的要求是：${opts.currentInput}${personaSuffix}` });
  messages.push({
    role: "system",
    content:
      `本次必须推荐 ${opts.count} 双（除非匹配良好的鞋款不足 ${opts.count} 双），按推荐指数从高到低排序。` +
      `请调用 recommend_shoes 工具返回；若无法使用工具，则只返回 JSON：` +
      `{"reply":"…","recommendations":[{"name":"球鞋名称","stars":4.5,"reason":"理由"}]}，不要任何 markdown 或多余文字。`
  });

  const { text, raw } = await callModel(client, messages);
  const result = parseResult(text);
  result.raw = raw.slice(0, 600);
  return result;
}

export function enrichRecommendations(
  raw: RecommendationRaw[] | null | undefined,
  shoesById: Map<string, Shoe>
): RecommendationItem[] {
  if (!Array.isArray(raw)) return [];
  const items: RecommendationItem[] = [];
  for (const rec of raw) {
    const shoe = shoesById.get(rec.shoe_id);
    if (!shoe) continue;
    items.push({
      shoe_id: shoe.id,
      stars: typeof rec.stars === "number" ? rec.stars : 3,
      reason: typeof rec.reason === "string" ? rec.reason : "",
      slug: shoe.slug,
      brand: shoe.brand,
      shoe_name: shoe.shoe_name,
      image_url: shoe.image_url ?? null,
      category: shoe.category ?? null
    });
  }
  return items;
}
