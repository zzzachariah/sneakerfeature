import type OpenAI from "openai";
import type { Shoe } from "@/lib/types";
import type { RecommendationItem, RecommendationRaw } from "@/lib/ai/types";
import type { Persona } from "@/lib/persona/types";
import { computeMatchScore } from "@/lib/match/score";
import { PACKY_MODEL } from "@/lib/ai/packy-client";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type RecommendResult = {
  reply: string;
  recommendations: RecommendationRaw[];
  raw?: string;
};

const SYSTEM_PROMPT = `你是 SNKR Feature 的专业篮球鞋推荐顾问。你只能从下方「鞋款目录」(JSON 数组) 中挑选球鞋，绝不能编造目录里没有的鞋；每条目录项的 "id" 是唯一标识，必须在结果里原样照抄这个 "id"。不要使用目录之外的网络知识。

用户随后会给出「本次要求」和需要推荐的数量 N，可能还会给出「球员档案」。请：
1. 自行理解「本次要求」的真实意图——中英文、口语、同义词、跨品牌的科技等价你都要靠自己的知识理解（例如"气垫/airsole"指 Zoom Air、Boost 等中底科技；"抓地"指 traction），把它对应到目录字段（品牌、型号、球员、中底/外底/鞋面科技、缓震/场地感/抓地/稳定/包裹、tags 等），不要拘泥字面、不要被某几个关键词限制。
2. 在目录里找出最匹配的鞋。
3. 若提供了「球员档案」（位置/水平/扁平足/身高/体重，及每双鞋的 personaFit 0-99），据此个性化：后卫→低帮/灵活/场地感；内线→缓震足/支撑/抗扭；扁平足→更强稳定与足弓支撑；体重大→更强缓震与支撑；初学者→容错，半职业/职业→响应。本次要求优先，档案为辅。
4. 对每双鞋，依据目录配置给出：stars（推荐指数，1-5 的数字，可用 0.5，与排序一致，越靠前越高）；pros（1-3 条优点）；cons（0-2 条缺点或注意点）；summary（一句话总结为什么推荐）。

输出 N 双，并【按推荐指数从高到低排序】（最推荐的放在数组第一个）。尽量凑满 N 双：只要目录里有沾边的，就返回最接近的，并在 cons/summary 说明差距。【不要返回空数组】，除非整个目录里确实没有任何篮球鞋。全部用用户的语言（默认中文）。

只输出一个 JSON 对象，不要 markdown、不要代码块、不要多余文字，结构如下：
{"reply":"<用用户语言写的一句总结>","recommendations":[{"id":"<原样照抄目录中的 id>","stars":4.5,"pros":["优点1","优点2"],"cons":["注意点"],"summary":"一句话总结"}]}`;

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
      id: shoe.id,
      brand: shoe.brand,
      name: shoe.shoe_name
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((s) => s.trim());
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
      const recommendations: RecommendationRaw[] = recs
        .map((rec) => {
          // Accept "id" (matches the catalog key) or "shoe_id"; tolerate non-string ids.
          const r = rec as {
            id?: unknown;
            shoe_id?: unknown;
            stars?: unknown;
            pros?: unknown;
            cons?: unknown;
            summary?: unknown;
            reason?: unknown;
          };
          const idVal = r.id ?? r.shoe_id;
          const summary =
            typeof r.summary === "string" && r.summary.trim()
              ? r.summary.trim()
              : typeof r.reason === "string"
                ? r.reason.trim()
                : "";
          return {
            shoe_id: typeof idVal === "string" ? idVal : idVal != null ? String(idVal) : "",
            stars: coerceStars(r.stars),
            pros: toStringArray(r.pros),
            cons: toStringArray(r.cons),
            summary
          };
        })
        .filter((rec) => rec.shoe_id);
      return { reply, recommendations };
    } catch {
      return null;
    }
  };

  const direct = tryParse(stripFences(text));
  if (direct) return direct;

  // Fallback: pull the first {...} block out of a noisy response.
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    const salvaged = tryParse(match[0]);
    if (salvaged) return salvaged;
  }
  return empty;
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
    content: `本次必须推荐 ${opts.count} 双（除非匹配良好的鞋款不足 ${opts.count} 双）。只返回 JSON，不要 markdown。`
  });

  // No response_format: the packyapi → Claude relay may not accept it. The
  // prompt demands strict JSON and parseResult() is defensive (fence-stripping
  // + first-object extraction).
  const completion = await client.chat.completions.create({
    model: PACKY_MODEL,
    temperature: 0.4,
    messages
  });

  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    const snippet = JSON.stringify(completion ?? {}).slice(0, 300);
    throw new Error(
      `上游返回了非预期响应（缺少 choices/content）——通常是 Base URL 路径不对（应以 /v1 结尾）或上游报错。响应片段：${snippet}`
    );
  }
  const result = parseResult(content);
  result.raw = content.slice(0, 600);
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
      pros: Array.isArray(rec.pros) ? rec.pros : [],
      cons: Array.isArray(rec.cons) ? rec.cons : [],
      summary: typeof rec.summary === "string" ? rec.summary : "",
      slug: shoe.slug,
      brand: shoe.brand,
      shoe_name: shoe.shoe_name,
      image_url: shoe.image_url ?? null,
      category: shoe.category ?? null
    });
  }
  return items;
}
