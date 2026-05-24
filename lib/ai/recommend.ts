import type OpenAI from "openai";
import type { Shoe, ShoeSpec } from "@/lib/types";
import type { RecommendationItem, RecommendationRaw, RecRadarAxis, WebReference } from "@/lib/ai/types";
import type { Persona } from "@/lib/persona/types";
import { computeMatchScore } from "@/lib/match/score";
import { dimScores } from "@/lib/star-rating";
import { getPerformanceLabel } from "@/lib/shoe-scoring";
import { normalizeSearchText, normalizeCompactText, rankShoeMatch } from "@/lib/search/shoe-search";
import { PACKY_MODEL } from "@/lib/ai/packy-client";
import { bochaWebSearch, describeBochaError, isBochaConfigured, type BochaErrorKind } from "@/lib/ai/web-search";

// Six performance axes for a shoe, mirroring the detail page's radar.
function buildRadarAxes(spec: ShoeSpec): RecRadarAxis[] {
  const d = dimScores(spec);
  return [
    { label: "Cushioning Feel", rawText: spec.cushioning_feel ?? null, score: d.cushioning_feel, tier: getPerformanceLabel(d.cushioning_feel) },
    { label: "Court Feel", rawText: spec.court_feel ?? null, score: d.court_feel, tier: getPerformanceLabel(d.court_feel) },
    { label: "Bounce", rawText: spec.bounce ?? null, score: d.bounce, tier: getPerformanceLabel(d.bounce) },
    { label: "Stability", rawText: spec.stability ?? null, score: d.stability, tier: getPerformanceLabel(d.stability) },
    { label: "Traction", rawText: spec.traction ?? null, score: d.traction, tier: getPerformanceLabel(d.traction) },
    { label: "Fit", rawText: spec.fit ?? null, score: d.fit, tier: getPerformanceLabel(d.fit) }
  ];
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

// What the model returns (name-based); we resolve names to catalog shoes ourselves.
export type ParsedRec = {
  name: string;
  stars: number;
  reason: string;
  pros: string[];
  cons: string[];
  references?: WebReference[];
};

// Coerce an unknown value into a clean array of short, non-empty strings.
function coerceStringArray(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

// Coerce an unknown value into a clean array of { title, url } references.
// Drops entries missing either field and dedups by URL.
function coerceReferences(value: unknown, max: number): WebReference[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: WebReference[] = [];
  for (const v of value) {
    if (!v || typeof v !== "object") continue;
    const r = v as { title?: unknown; url?: unknown };
    const title = typeof r.title === "string" ? r.title.trim() : "";
    const url = typeof r.url === "string" ? r.url.trim() : "";
    if (!title || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ title: title.slice(0, 200), url: url.slice(0, 500) });
    if (out.length >= max) break;
  }
  return out;
}

export type WebSearchStats = {
  attempts: number;
  succeeded: number;
  failures: { kind: BochaErrorKind; detail: string; query: string }[];
};

export type RecommendResult = {
  reply: string;
  title?: string;
  recommendations: ParsedRec[];
  raw?: string;
  searchStats?: WebSearchStats;
};

const SYSTEM_PROMPT = `你是 SNKR Feature 的专业篮球鞋推荐顾问。你只能从下方「鞋款目录」(JSON 数组) 中挑选球鞋，绝不能编造目录里没有的鞋，也不要使用目录之外的网络知识。

用户随后会给出「本次要求」和需要推荐的数量 N，可能还会给出「球员档案」。请：
1. 自行理解「本次要求」的真实意图——中英文、口语、同义词、跨品牌的科技等价你都要靠自己的知识理解（例如"气垫/airsole"指 Zoom Air、Boost 等中底科技；"抓地"指 traction），不要拘泥字面、不要被某几个关键词限制。
2. 在目录里找出最匹配的鞋（用目录里每双鞋的 name 字段作为它的名称）。
3. 若提供了「球员档案」（位置/水平/扁平足/身高/体重，以及每双鞋的 personaFit 0-99），据此个性化：后卫→低帮/灵活/场地感；内线→缓震足/支撑/抗扭；扁平足→更强稳定与足弓支撑；体重大→更强缓震与支撑；初学者→容错，半职业/职业→响应。本次要求优先，档案为辅。
4. 对每双鞋给出：name（球鞋名称，必须与目录里的 name 尽量一致）、stars（推荐指数，1-5 的数字，可用 0.5，越靠前越高）、reason（一句话推荐理由）、pros（优点，2-3 条简短要点的数组）、cons（缺点，1-2 条简短要点的数组）。

【严格的事实要求 — 务必逐字照抄，宁缺勿编】reason、pros、cons、reply 中提到的任何中底/外底/鞋面科技、配置或性能，都必须来自该鞋在目录条目里实际出现的字段（forefoot_midsole、heel_midsole、outsole、upper、cushioning_feel、court_feel、bounce、stability、traction、fit、playstyle、tags 等）。引用科技名时必须从该鞋目录条目里**逐字复制**——一字不差，包括大小写、空格、连字符、版本号、以及 X / Pro / HD / Plus 等后缀。

严禁以下行为（看似无害，但都属于编造）：
- 把目录里的科技名"翻译"、"扩写"、"补全"、"改写"或"标准化"成更常见的名字。例如：\`ZoomX\` ≠ \`Zoom Air\` ≠ \`Air Zoom\`；\`Cut3 ZoomX\` 是一个完整的科技名，绝不能拆成 \`Zoom\` 或换成 \`Air Zoom / Zoom Air\`（它们是 Nike 完全不同的产品线）；\`React X\` ≠ \`React\`；\`BOOST HD\` ≠ \`Boost\`；\`Lightstrike Pro\` ≠ \`Lightstrike\`。
- 因为某个科技名"听起来像"另一个常见科技，或"属于同品牌另一条产品线"，就把它替换成那个更熟悉的名字。
- 把别的鞋款、系列或网络/常识里的科技安到这双鞋上（即使你"知道"这双鞋还有别的配置）。
- 声称该鞋有目录里没写明的配置或部件（例如目录没出现"碳板/carbon"就不能说有碳板；没出现"气垫"就不能说有气垫）。
- 凭空编造数值参数（厚度、重量、落差、硬度等目录里没有的数字）。

【宁缺勿编】如果某项信息目录条目里没有，就用通用、模糊的描述（如"前掌缓震到位"、"抓地表现不错"、"鞋面包裹稳定"）代替，或者干脆不提；绝不要凭空给出一个具体的科技名称来填补空白。优点与缺点都必须基于目录里该鞋的真实数据。

5. 【两步走的推荐流程 — 候选优先】
   (a) 先从目录里挑出最多 N 双初步符合用户「本次要求」的候选鞋（N = 用户在界面上单独设定的数量，见规则 9）。
   (b) 用 web_search 查这几双候选鞋的口碑、实测、用户穿着反馈、评测对比（每次对话最多调用 3 次，每次 query 应明确包含某一双或多双候选鞋的型号名）。根据网络反馈在这几双之间做差异化判断，并据此调整每双鞋的 stars。
   (c) 最终输出 N 双；stars 必须反映你做过的网络调研——某双鞋如果网评一致差评则下调，一致好评且贴合用户需求则上调。
   注意：web_search **不是** 用来"补"目录里某双鞋的科技参数（目录是球鞋事实的唯一来源）；web_search **是** 用来查目录里没有的主观信息——口碑、实战感受、特定场景表现等。

6. 【信息优先级】当网络结果与目录条目存在冲突时，永远以目录为准；网络内容仅用于补充背景常识与口碑。绝不能用网络上看到的科技名/数值去替换或"修正"目录里某双鞋的字段——这同样违反【严格的事实要求】。

7. 【网络来源标注 + references 字段】
   - 凡是来自 web_search 的内容，在那句话末尾用「（来源：网页 - <网页标题>）」标注。
   - 同时，**必须**把对应网页的 title 和 url 填到该鞋 recommendation 的 references 数组里（每双鞋自己的 references；如果某双鞋没有用到任何网页就留空数组）。
   - 不要把同一个网页重复放进同一双鞋的 references。

8. 【引用用户原话】在 reason 与 reply 中解释鞋款为何契合时，必须用引号把用户「本次要求」里的原始表述复述出来，再说明该鞋如何匹配。例如用户说"前掌宽大一点的"，你应写：『针对你说的"前掌宽大一点的"，这双鞋的鞋头加宽设计能……』。只复述用户实际写过的短语，不要意译或改写他们的措辞。

9. 【数量由 N 锁定】N（用户在界面上选定的推荐数量）是唯一的真相。即使用户在「本次要求」的正文里写了"推荐 10 双"、"给我 5 个"、"来 20 双"等数字，也必须严格按照 N 来推荐——不多不少。reply 总结里也只能提到 N 这个数字，不要复读用户写的其他数量。

10. 【对话标题 title】在输出 JSON 中同时给出 title 字段：用 6-14 个汉字（或英文 3-6 个词）凝练概括用户「本次要求」的核心诉求，作为这次对话的标题。不要加引号或标点，不要带"推荐"、"求推荐"之类的多余前后缀，直接用关键词组合（例如"控卫低帮抓地好的鞋"、"扁平足后卫缓震首选"、"low-top guard shoes with grip"）。用户用什么语言你就用什么语言。

输出 N 双，按推荐指数从高到低排序。尽量凑满 N 双；只要目录里有沾边的就返回最接近的。不要返回空列表，除非目录里没有任何篮球鞋。请用与用户「本次要求」相同的语言回复（用户用中文就全程中文，用英文就全程英文）。`;

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
      const parsed = JSON.parse(raw) as { reply?: unknown; title?: unknown; recommendations?: unknown };
      const reply = typeof parsed.reply === "string" ? parsed.reply : "";
      // Strip wrapping quotes / brackets and any leading/trailing punctuation the
      // model sometimes adds despite the prompt; hard-cap at 30 chars so titles
      // don't blow out the sidebar / header.
      const rawTitle = typeof parsed.title === "string" ? parsed.title.trim() : "";
      const title = rawTitle
        .replace(/^[\s"'`「『《【\[\(]+|[\s"'`」』》】\]\)。.!?！？、,，;；:：]+$/g, "")
        .slice(0, 30);
      const recs = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];
      const recommendations: ParsedRec[] = recs
        .map((rec) => {
          const r = rec as {
            name?: unknown;
            shoe_name?: unknown;
            stars?: unknown;
            reason?: unknown;
            summary?: unknown;
            pros?: unknown;
            cons?: unknown;
            references?: unknown;
          };
          const name =
            typeof r.name === "string" ? r.name : typeof r.shoe_name === "string" ? r.shoe_name : "";
          const reason =
            typeof r.reason === "string" && r.reason.trim()
              ? r.reason
              : typeof r.summary === "string"
                ? r.summary
                : "";
          const refs = coerceReferences(r.references, 5);
          return {
            name: name.trim(),
            stars: coerceStars(r.stars),
            reason: reason.trim(),
            pros: coerceStringArray(r.pros, 3),
            cons: coerceStringArray(r.cons, 2),
            ...(refs.length > 0 ? { references: refs } : {})
          };
        })
        .filter((rec) => rec.name);
      return { reply, recommendations, ...(title ? { title } : {}) };
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

// Last-resort recovery: when the model answers in prose (ignoring the JSON
// contract) but still names real catalog shoes, pull them out by scanning the
// text for catalog names. Precision over recall — a false positive would charge
// the user for a shoe the model never recommended.
function salvageFromProse(text: string, shoes: Shoe[]): ParsedRec[] {
  const compactProse = normalizeCompactText(text);
  if (!compactProse) return [];

  type Hit = { shoe: Shoe; compactName: string; index: number };
  const hits: Hit[] = [];
  for (const shoe of shoes) {
    const compactName = normalizeCompactText(shoe.shoe_name);
    if (compactName.length < 6) continue; // skip short names that collide easily
    const index = compactProse.indexOf(compactName);
    if (index >= 0) hits.push({ shoe, compactName, index });
  }
  if (!hits.length) return [];

  // Drop a name that is a substring of a longer matched name (keep "kobe8protro",
  // drop "kobe8") so overlapping models don't both fire.
  const kept: Hit[] = [];
  for (const hit of [...hits].sort((a, b) => b.compactName.length - a.compactName.length)) {
    if (kept.some((k) => k.compactName !== hit.compactName && k.compactName.includes(hit.compactName))) continue;
    kept.push(hit);
  }

  const seen = new Set<string>();
  const recs: ParsedRec[] = [];
  for (const hit of kept.sort((a, b) => a.index - b.index)) { // preserve prose order
    if (seen.has(hit.shoe.id)) continue;
    seen.add(hit.shoe.id);
    recs.push({ name: hit.shoe.shoe_name, stars: 3, reason: "", pros: [], cons: [] });
  }
  return recs;
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
        title: {
          type: "string",
          description: "本次对话的简短标题：6-14 个汉字或 3-6 个英文词，凝练用户本次需求的关键词组合。不要标点、引号、不要带『推荐』前后缀。"
        },
        recommendations: {
          type: "array",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "球鞋名称，必须与目录里的 name 尽量一致" },
              stars: { type: "number", description: "推荐指数 1-5，可用 0.5。如果做了 web_search，应反映网络口碑（差评下调、好评上调）" },
              reason: { type: "string", description: "一句话推荐理由，应包含用户原话的引号片段" },
              pros: { type: "array", items: { type: "string" }, description: "优点，2-3 条简短要点，基于目录数据" },
              cons: { type: "array", items: { type: "string" }, description: "缺点，1-2 条简短要点，基于目录数据" },
              references: {
                type: "array",
                description: "本双鞋引用过的网页（来自 web_search）。若没有用网络资料，留空数组即可。",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string", description: "网页标题" },
                    url: { type: "string", description: "网页 URL（必须 http(s) 开头）" }
                  },
                  required: ["title", "url"]
                }
              }
            },
            required: ["name", "stars", "reason", "pros", "cons"]
          }
        }
      },
      required: ["recommendations"]
    }
  }
};

const WEB_SEARCH_TOOL: OpenAI.Chat.Completions.ChatCompletionTool = {
  type: "function",
  function: {
    name: "web_search",
    description:
      "搜索网页获取目录之外的一般性常识（如运动恢复原理、位置打法常识、术语解释）。不要用它去查具体球鞋的科技配置——目录(catalog)是球鞋事实的唯一来源。",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "搜索关键词（中文或英文）" } },
      required: ["query"]
    }
  }
};

const MAX_TOOL_ITERATIONS = 3;
const MAX_SEARCH_RESULTS = 3;

// Multi-turn tool loop: gives the model both `web_search` and `recommend_shoes`
// and lets it decide. Returns null on any non-success path so the caller can
// fall through to the existing prefill / plain-call strategies. The returned
// RecommendResult carries a `searchStats` so route.ts can log how many web
// searches were attempted and how many failed (with categorized error kinds).
async function tryToolLoopWithSearch(
  client: OpenAI,
  initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  base: { model: string; temperature: number; max_tokens: number }
): Promise<RecommendResult | null> {
  const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...initialMessages];
  const stats: WebSearchStats = { attempts: 0, succeeded: 0, failures: [] };

  const finalize = (r: RecommendResult): RecommendResult => {
    if (stats.attempts > 0) {
      // Always log a one-line summary per request so operators can spot a bad
      // key / outage trend in Vercel logs.
      console.warn("[web-search] summary", {
        attempts: stats.attempts,
        succeeded: stats.succeeded,
        failures: stats.failures.map((f) => ({ kind: f.kind, query: f.query.slice(0, 60) }))
      });
      if (stats.attempts > 0 && stats.succeeded === 0) {
        console.warn("[web-search] all attempts failed", {
          // De-dup failure kinds for an at-a-glance signal of "key broken" vs "all timeout".
          kinds: Array.from(new Set(stats.failures.map((f) => f.kind))),
          firstDetail: stats.failures[0]?.detail.slice(0, 200)
        });
      }
    }
    return { ...r, searchStats: stats };
  };
  const finalizeNull = (): null => {
    if (stats.attempts > 0) {
      console.warn("[web-search] loop bailed out", {
        attempts: stats.attempts,
        succeeded: stats.succeeded,
        failures: stats.failures.map((f) => f.kind)
      });
    }
    return null;
  };

  const okIfRecs = (text: string): RecommendResult | null => {
    const r = parseResult(text);
    return r.recommendations.length ? { ...r, raw: text.slice(0, 600) } : null;
  };

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const c = await client.chat.completions.create({
      ...base,
      messages: convo,
      tools: [WEB_SEARCH_TOOL, RECOMMEND_TOOL],
      tool_choice: "auto"
    });
    const msg = c.choices?.[0]?.message;
    if (!msg) return finalizeNull();

    const toolCalls = msg.tool_calls ?? [];

    // Terminal: model called recommend_shoes → parse and return.
    const recCall = toolCalls.find((t) => t.function?.name === "recommend_shoes");
    if (recCall?.function?.arguments) {
      const r = okIfRecs(recCall.function.arguments);
      if (r) return finalize(r);
    }

    // No tool calls at all → model produced prose. Try to parse JSON from it; if
    // that fails, bail so the caller's later strategies can run.
    if (toolCalls.length === 0) {
      if (typeof msg.content === "string") {
        const r = okIfRecs(msg.content);
        if (r) return finalize(r);
      }
      return finalizeNull();
    }

    // Service every web_search call; append the assistant turn (with tool_calls)
    // and one `tool` message per call. Required by OpenAI tool protocol.
    convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
    let didSearch = false;
    for (const call of toolCalls) {
      if (call.function?.name === "recommend_shoes") {
        // Already tried to parse above; if it failed, tell the model so.
        convo.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({ error: "invalid_recommendation_payload, please retry" })
        });
        continue;
      }
      if (call.function?.name !== "web_search") {
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "unknown_tool" }) });
        continue;
      }
      let q = "";
      try {
        q = (JSON.parse(call.function.arguments || "{}") as { query?: string }).query?.trim() ?? "";
      } catch {
        /* leave q empty */
      }
      if (!q) {
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "empty_query" }) });
        continue;
      }
      const sr = await bochaWebSearch(q, { count: MAX_SEARCH_RESULTS, timeoutMs: 8000 });
      didSearch = true;
      stats.attempts += 1;
      if (sr.ok) {
        stats.succeeded += 1;
      } else {
        stats.failures.push({ kind: sr.error, detail: sr.detail, query: sr.query });
      }
      // Pass a tagged error kind + human description to the model so it can
      // adapt (e.g., "搜索超时了，按现有目录回答即可") instead of guessing.
      const payload = sr.ok
        ? { query: sr.query, results: sr.results }
        : { query: sr.query, error: sr.error, message: describeBochaError(sr.error, sr.detail), results: [] };
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(payload) });
    }

    // If the model only called recommend_shoes (bad args, no search) and we
    // haven't returned, give up so the caller falls through.
    if (!didSearch && !recCall) return finalizeNull();
  }
  // Iteration cap exhausted.
  return finalizeNull();
}

// packyapi's relay behavior (tools / response_format support) is unknown, so we
// try several structured-output mechanisms in order of reliability and use the
// first that yields parseable recommendations: JSON mode → forced tool call →
// assistant prefill (the canonical Claude method) → plain call. If every attempt
// comes back as prose, salvage shoe names from that prose as a last resort.
async function getRecommendations(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  shoes: Shoe[]
): Promise<RecommendResult> {
  const base = { model: PACKY_MODEL, temperature: 0.2, max_tokens: 3000 };
  const ok = (text: string): RecommendResult | null => {
    const r = parseResult(text);
    return r.recommendations.length ? { ...r, raw: text.slice(0, 600) } : null;
  };
  // Prose seen from attempts that produced no JSON — salvaged at the end.
  const prose: string[] = [];

  // 1) JSON mode — the most widely supported OpenAI-compatible structured-output
  //    primitive; the prompt contains the word "JSON" + an example as required.
  try {
    const c = await client.chat.completions.create({
      ...base,
      messages,
      response_format: { type: "json_object" }
    });
    const content = c.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      const r = ok(content);
      if (r) return r;
      prose.push(content);
    }
  } catch {
    /* response_format unsupported — try the next strategy */
  }

  // 2) Tool call — clean structured args when the relay supports tools. When
  //    Bocha web search is configured, run a multi-turn loop offering both
  //    `web_search` and `recommend_shoes` so the model can fetch general
  //    knowledge before answering. Otherwise force `recommend_shoes` directly
  //    (identical to the legacy single-call behavior).
  try {
    if (isBochaConfigured()) {
      const looped = await tryToolLoopWithSearch(client, messages, base);
      if (looped) return looped;
    } else {
      const c = await client.chat.completions.create({
        ...base,
        messages,
        tools: [RECOMMEND_TOOL],
        tool_choice: { type: "function", function: { name: "recommend_shoes" } }
      });
      const msg = c.choices?.[0]?.message;
      const args = msg?.tool_calls?.[0]?.function?.arguments;
      if (typeof args === "string") {
        const r = ok(args);
        if (r) return r;
      }
      if (typeof msg?.content === "string") {
        const r = ok(msg.content);
        if (r) return r;
      }
    }
  } catch {
    /* tools unsupported — try the next strategy */
  }

  // 3) Assistant prefill — Claude continues the JSON object we started.
  try {
    const prefill = '{"recommendations":';
    const c = await client.chat.completions.create({
      ...base,
      messages: [...messages, { role: "assistant", content: prefill }]
    });
    const out = c.choices?.[0]?.message?.content;
    if (typeof out === "string") {
      const r = ok(prefill + out) ?? ok(out);
      if (r) return r;
    }
  } catch {
    /* prefill not accepted — try the next strategy */
  }

  // 4) Plain call — last resort; parse whatever comes back (may be prose).
  const c = await client.chat.completions.create({ ...base, messages });
  const content = c?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    const snippet = JSON.stringify(c ?? {}).slice(0, 300);
    throw new Error(
      `上游返回了非预期响应（缺少 choices/content）——通常是 Base URL 路径不对（应以 /v1 结尾）或上游报错。响应片段：${snippet}`
    );
  }
  const parsed = parseResult(content);
  if (parsed.recommendations.length) return { ...parsed, raw: content.slice(0, 600) };

  // Salvage: the model answered in prose but may have named real catalog shoes.
  // Prefer the plain answer, then any prose seen from earlier strategies.
  for (const text of [content, ...prose]) {
    const recs = salvageFromProse(text, shoes);
    if (recs.length) {
      return { reply: text.trim().slice(0, 500), recommendations: recs, raw: text.slice(0, 600) };
    }
  }
  return { ...parsed, raw: content.slice(0, 600) };
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
  // The strict output contract lives in the final user turn (not a trailing
  // system message): Claude-style relays merge system messages to the top, which
  // would bury this "last word" and let the model answer the casual query in prose.
  messages.push({
    role: "user",
    content:
      `现在推荐的要求是："${opts.currentInput}"${personaSuffix}\n\n` +
      `请在每双鞋的 reason（以及总的 reply）里，至少引用一次用户上面这句话里的原始短语（带英文双引号），然后说明该鞋如何匹配那一点。\n\n` +
      `【数量锁定】本次 N = ${opts.count}。必须严格推荐 ${opts.count} 双——即使用户在「本次要求」正文里写了别的数字（"推荐10双"、"5个"等）也要忽略，以 N = ${opts.count} 为准；reply 里也只能提 ${opts.count}。` +
      `按推荐指数从高到低排序。（唯一例外：目录里匹配良好的鞋款不足 ${opts.count} 双时可以少返回。）\n\n` +
      `推荐流程：(1) 从目录里挑出 ${opts.count} 双初步候选；(2) 用 web_search 查这些候选的口碑/实测（每次对话最多 3 次）；(3) 根据网络反馈给 stars 做差异化打分；(4) 把每双鞋引用过的网页 title/url 填到该鞋的 references 数组里。\n\n` +
      `另外请同时输出 title 字段（6-14 个汉字或 3-6 个英文词，用关键词组合凝练本次需求，无标点/引号），作为这次对话的标题。\n\n` +
      `请调用 recommend_shoes 工具返回；若无法使用工具，则只返回 JSON：` +
      `{"reply":"…","title":"控卫低帮抓地好的鞋","recommendations":[{"name":"球鞋名称","stars":4.5,"reason":"理由","pros":["优点1","优点2"],"cons":["缺点1"],"references":[{"title":"网页标题","url":"https://..."}]}]}，不要任何 markdown 或多余文字。`
  });

  return getRecommendations(client, messages, opts.shoes);
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
    const spec = shoe.spec ?? {};
    const refs = coerceReferences(rec.references, 5);
    items.push({
      shoe_id: shoe.id,
      stars: typeof rec.stars === "number" ? rec.stars : 3,
      reason: typeof rec.reason === "string" ? rec.reason : "",
      pros: coerceStringArray(rec.pros, 3),
      cons: coerceStringArray(rec.cons, 2),
      ...(refs.length > 0 ? { references: refs } : {}),
      slug: shoe.slug,
      brand: shoe.brand,
      shoe_name: shoe.shoe_name,
      image_url: shoe.image_url ?? null,
      category: shoe.category ?? null,
      radar: buildRadarAxes(spec),
      tech: {
        forefoot: spec.forefoot_midsole_tech ?? null,
        heel: spec.heel_midsole_tech ?? null,
        outsole: spec.outsole_tech ?? null,
        upper: spec.upper_tech ?? null
      },
      playstyle: spec.playstyle_summary ?? null
    });
  }
  return items;
}
