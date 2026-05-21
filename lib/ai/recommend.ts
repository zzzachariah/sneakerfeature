import type OpenAI from "openai";
import type { Shoe } from "@/lib/types";
import type { RecommendationItem, RecommendationRaw } from "@/lib/ai/types";
import { PACKY_MODEL } from "@/lib/ai/packy-client";

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type RecommendResult = {
  reply: string;
  recommendations: RecommendationRaw[];
};

const SYSTEM_PROMPT = `你是 SNKR Feature 的篮球鞋推荐专家。你只能从下方提供的「鞋款目录」(JSON) 中推荐球鞋，绝不能编造目录里不存在的球鞋或 id，也不要依赖目录之外的网络信息。

请理解用户用自然语言描述的偏好，并映射到目录字段，包括跨品牌、跨语言的同义词与科技等价关系，例如：
- "气垫"/"气垫感"/"软弹"/"脚感" ↔ 任意中底缓震科技：Zoom Air、Air、Boost、React、Nitro、Lightstrike、Cushlon、FF/FlightSpeed、䨻 等（看 forefoot_midsole / heel_midsole / cushioning_feel / bounce）
- "抓地"/"防滑"/"急停" ↔ traction / 人字纹 herringbone outsole
- "稳定"/"防崴脚"/"支撑" ↔ stability / support / containment / 抗扭
- "轻"/"轻量" ↔ weight 较小
- "后卫"/"控卫"/"小个子"/"灵活" ↔ category=guard、低帮、court_feel 好
- "内线"/"中锋"/"大个子"/"暴力" ↔ category=big/forward、缓震足、支撑强
- 预算（元/块/RMB/¥）↔ price 字段

用户会明确告诉你这次需要推荐几双 (N)。请正好推荐 N 双，按匹配度从高到低排序。如果真正匹配良好的不足 N 双，可以少给（不要用劣质匹配来凑数）。

为每一双推荐写 1-2 句简洁的「推荐理由」，使用用户的语言（默认中文），并引用具体配置/科技来解释为什么符合需求。

只输出严格的 JSON，不要 markdown、不要多余文字，结构如下：
{"reply":"<用用户语言写的一句友好开场/总结>","recommendations":[{"shoe_id":"<目录中的 id>","reason":"<推荐理由>"}]}`;

function buildCompactCatalog(shoes: Shoe[]) {
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
    if (shoe.price != null) entry.price = shoe.price;
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
    return entry;
  });
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
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
          const r = rec as { shoe_id?: unknown; reason?: unknown };
          return {
            shoe_id: typeof r.shoe_id === "string" ? r.shoe_id : "",
            reason: typeof r.reason === "string" ? r.reason : ""
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
  opts: { shoes: Shoe[]; turns: ChatTurn[]; count: number }
): Promise<RecommendResult> {
  const catalog = buildCompactCatalog(opts.shoes);

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: `${SYSTEM_PROMPT}\n\n鞋款目录(JSON):\n${JSON.stringify(catalog)}` }
  ];
  for (const turn of opts.turns) {
    if (turn.role === "user") messages.push({ role: "user", content: turn.content });
    else messages.push({ role: "assistant", content: turn.content });
  }
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
  return parseResult(content);
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
      reason: rec.reason ?? "",
      slug: shoe.slug,
      brand: shoe.brand,
      shoe_name: shoe.shoe_name,
      image_url: shoe.image_url ?? null,
      category: shoe.category ?? null,
      price: shoe.price ?? null
    });
  }
  return items;
}
