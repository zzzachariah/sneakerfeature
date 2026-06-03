import type OpenAI from "openai";
import type { Shoe, ShoeSpec, BloggerReview } from "@/lib/types";
import type { RecommendationItem, RecommendationRaw, RecRadarAxis, WebReference, OnProgress } from "@/lib/ai/types";
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

// Why the tool loop exited without producing a usable RecommendResult.
// Surfaced to route.ts so operators can tell "model never called a tool" from
// "search worked but max iterations hit" etc.
export type LoopExitReason =
  | "success"
  | "prose_no_tools"      // model returned content with no tool_calls
  | "max_iterations"      // hit MAX_TOOL_ITERATIONS without finishing
  | "no_search_no_recs"   // model called only recommend_shoes with bad args
  | "no_choice_message"   // upstream returned no message at all
  | "api_error";          // client.create threw

export type RecommendResult = {
  reply: string;
  title?: string;
  recommendations: ParsedRec[];
  raw?: string;
  searchStats?: WebSearchStats;
  loopExitReason?: LoopExitReason;
};

const SYSTEM_PROMPT = `你是 sneakerfeature 的专业篮球鞋推荐顾问。你只能从下方「鞋款目录」(JSON 数组) 中挑选球鞋，绝不能编造目录里没有的鞋，也不要使用目录之外的网络知识。

用户随后会给出「本次要求」和需要推荐的数量 N，可能还会给出「球员档案」。请：
1. 自行理解「本次要求」的真实意图——中英文、口语、同义词、跨品牌的科技等价你都要靠自己的知识理解（例如"气垫/airsole"指 Zoom Air、Boost 等中底科技；"抓地"指 traction），不要拘泥字面、不要被某几个关键词限制。
2. 在目录里找出最匹配的鞋（用目录里每双鞋的 name 字段作为它的名称）。
3. 若提供了「球员档案」（位置/水平/扁平足/身高/体重，以及每双鞋的 personaFit 0-99），据此个性化：后卫→低帮/灵活/场地感；内线→缓震足/支撑/抗扭；扁平足→更强稳定与足弓支撑；体重大→更强缓震与支撑；初学者→容错，半职业/职业→响应。本次要求优先，档案为辅。
4. 对每双鞋给出：name（球鞋名称，必须与目录里的 name 尽量一致）、stars（推荐指数，1-5 的数字，可用 0.5，越靠前越高）、reason（一句话推荐理由）、pros（优点，正好 3 条简短要点的数组）、cons（缺点，正好 3 条简短要点的数组）。

【严格的事实要求 — 务必逐字照抄，宁缺勿编】reason、pros、cons、reply 中提到的任何中底/外底/鞋面科技、配置或性能，都必须来自该鞋在目录条目里实际出现的字段（forefoot_midsole、heel_midsole、outsole、upper、cushioning_feel、court_feel、bounce、stability、traction、fit、playstyle、tags 等）。引用科技名时必须从该鞋目录条目里**逐字复制**——一字不差，包括大小写、空格、连字符、版本号、以及 X / Pro / HD / Plus 等后缀。

严禁以下行为（看似无害，但都属于编造）：
- 把目录里的科技名"翻译"、"扩写"、"补全"、"改写"或"标准化"成更常见的名字。例如：\`ZoomX\` ≠ \`Zoom Air\` ≠ \`Air Zoom\`；\`Cut3 ZoomX\` 是一个完整的科技名，绝不能拆成 \`Zoom\` 或换成 \`Air Zoom / Zoom Air\`（它们是 Nike 完全不同的产品线）；\`React X\` ≠ \`React\`；\`BOOST HD\` ≠ \`Boost\`；\`Lightstrike Pro\` ≠ \`Lightstrike\`。
- 因为某个科技名"听起来像"另一个常见科技，或"属于同品牌另一条产品线"，就把它替换成那个更熟悉的名字。
- 把别的鞋款、系列或网络/常识里的科技安到这双鞋上（即使你"知道"这双鞋还有别的配置）。
- 声称该鞋有目录里没写明的配置或部件（例如目录没出现"碳板/carbon"就不能说有碳板；没出现"气垫"就不能说有气垫）。
- 凭空编造数值参数（厚度、重量、落差、硬度等目录里没有的数字）。

【宁缺勿编】如果某项信息目录条目里没有，就用通用、模糊的描述（如"前掌缓震到位"、"抓地表现不错"、"鞋面包裹稳定"）代替，或者干脆不提；绝不要凭空给出一个具体的科技名称来填补空白。

【优点/缺点的来源 — 数据库 + 博主点评 + 网络】reason、pros、cons 里的主观使用感受（脚感、口碑、实战优缺点）可以综合三类来源：(a) 目录里该鞋的性能字段（数据库）；(b) 该鞋目录条目里的 blogger 字段（博主点评整理好的优缺点）；(c) web_search 查到的口碑。请忠实转述、不要编造；凡引用了博主或网页的观点，就在该条末尾注明来源（如"（来源：博主点评）"或"（来源：网页 - 标题）"）。但上面【严格的事实要求】对"具体科技/配置名称"的限制依然不变——科技名只能逐字引用目录，不能用博主或网络里的说法替换、新增或改写。每双鞋请尽量给满 3 条优点和 3 条缺点。

5. 【推荐流程 — 候选优先 + 立即行动】
   **你必须立即调用 web_search 或 recommend_shoes 工具，绝对不要在 reply/content 里先用自然语言描述你的计划、步骤、或"让我先做 X"。** 计划用工具调用来体现，不用文字。
   - 还没做过 web_search 调研时：先调 web_search，query 要**围绕用户「本次要求」的使用场景/诉求**展开（位置、打法、脚型、伤病、术语、选鞋要点等目录之外的通用常识），不必拘泥于具体鞋型号名。
   - 拿到足够的网络反馈（最多 3 次 web_search）后：调用 recommend_shoes 给出最终 N 双；stars 应结合网络反馈做差异化（口碑差的下调、好的上调）。
   注意：web_search **不是** 用来"补"目录里某双鞋的科技参数（目录是球鞋事实的唯一来源）；web_search **是** 用来查目录里没有的主观信息——使用场景常识、口碑、实战感受、特定场景表现等。

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

// Up to 3 deduped blogger pros/cons for a shoe, handed to the model as real
// subjective material it may weave into its reason/pros/cons (Chinese, matching
// the prompt). Shoes without published reviews omit the field entirely.
function compactBlogger(reviews: BloggerReview[] | undefined): { pros: string[]; cons: string[] } | null {
  if (!reviews?.length) return null;
  const pros: string[] = [];
  const cons: string[] = [];
  const ps = new Set<string>();
  const cs = new Set<string>();
  for (const r of reviews) {
    for (const p of r.pros ?? []) {
      const t = p.trim();
      if (t && !ps.has(t) && pros.length < 3) {
        ps.add(t);
        pros.push(t);
      }
    }
    for (const c of r.cons ?? []) {
      const t = c.trim();
      if (t && !cs.has(t) && cons.length < 3) {
        cs.add(t);
        cons.push(t);
      }
    }
  }
  return pros.length || cons.length ? { pros, cons } : null;
}

function buildCompactCatalog(
  shoes: Shoe[],
  persona?: Persona | null,
  reviewsByShoe?: Record<string, BloggerReview[]>
) {
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
    const blogger = compactBlogger(reviewsByShoe?.[shoe.id]);
    if (blogger) entry.blogger = blogger;
    return entry;
  });
}

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
}

// Turn a model `content` string into clean, human-readable "thinking" text safe
// to stream into the live timeline — or null when there's nothing worth showing.
// This relay frequently dumps machine output (the JSON answer, tool args, or a
// ```json fenced block) into `content` instead of a tool_call; streaming that
// verbatim leaked raw code into the chat. We strip every such structure and keep
// only the natural-language sentences.
function sanitizeThinkingText(content: string): string | null {
  let t = content;
  // 1) Drop fenced code blocks entirely — both well-formed (```lang … ```) and an
  //    unterminated trailing fence the stream may have cut off mid-block.
  t = t.replace(/```[\s\S]*?```/g, " ").replace(/```[\s\S]*$/g, " ");
  // 2) Cut the first JSON-ish structure and everything after it. Genuine prose
  //    never contains a bare "{"; "[{" / "[\"" is the array-of-objects/strings
  //    shape. Whichever appears first marks where the machine output begins.
  const objAt = t.indexOf("{");
  const arrAt = t.match(/\[\s*[{"]/)?.index ?? -1;
  const cut = objAt >= 0 && arrAt >= 0 ? Math.min(objAt, arrAt) : objAt >= 0 ? objAt : arrAt;
  if (cut >= 0) t = t.slice(0, cut);
  // 3) Drop any residual structured-output key lines (JSON that slipped the cut).
  t = t
    .split("\n")
    .filter((line) => !/"(?:recommendations|reply|title|stars|references|name|reason|pros|cons|url)"\s*:/.test(line))
    .join("\n");
  // 4) Tidy whitespace; require a couple of real characters, and reject anything
  //    that is just leftover punctuation/brackets.
  const cleaned = t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length < 2 || /^[[\]{}"',:]+$/.test(cleaned)) return null;
  return cleaned;
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
            cons: coerceStringArray(r.cons, 3),
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
              pros: { type: "array", items: { type: "string" }, description: "优点，正好 3 条简短要点，可综合目录数据、blogger 博主点评与网络口碑（引用博主/网页须注明来源）" },
              cons: { type: "array", items: { type: "string" }, description: "缺点，正好 3 条简短要点，可综合目录数据、blogger 博主点评与网络口碑（引用博主/网页须注明来源）" },
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

// Higher cap than before: we now nudge the model to "finish" instead of bailing
// on the first prose turn, so the loop needs more headroom. Cost isn't a concern
// (the deterministic fallback guarantees a result regardless of how this ends).
const MAX_TOOL_ITERATIONS = 6;
const MAX_SEARCH_RESULTS = 3;
// Force recommend_shoes once the model has searched this many times, so it
// commits to an answer instead of searching forever.
const MAX_SEARCHES = 3;

// What the loop returns to the caller — always includes stats and an exit
// reason so the caller can attach them to whatever final RecommendResult comes
// out (whether the loop produced it or a downstream fallback did).
export type LoopOutcome = {
  result: RecommendResult | null;
  stats: WebSearchStats;
  exitReason: LoopExitReason;
};

// Multi-turn tool loop: gives the model both `web_search` and `recommend_shoes`.
// Iteration 0 FORCES `web_search` so every recommendation request makes at least
// one real Bocha call and the model's `references` are grounded in live results
// (without this the model fabricates plausible-looking URLs from memory).
// Subsequent iterations use "auto" so the model can search again (up to
// MAX_TOOL_ITERATIONS) or commit to recommend_shoes once it has enough info.
async function tryToolLoopWithSearch(
  client: OpenAI,
  initialMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  base: { model: string; temperature: number; max_tokens: number },
  currentInput: string,
  onProgress?: OnProgress
): Promise<LoopOutcome> {
  const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...initialMessages];
  const stats: WebSearchStats = { attempts: 0, succeeded: 0, failures: [] };

  const finalize = (r: RecommendResult): LoopOutcome => {
    if (stats.attempts > 0) {
      console.warn("[web-search] summary", {
        attempts: stats.attempts,
        succeeded: stats.succeeded,
        failures: stats.failures.map((f) => ({ kind: f.kind, query: f.query.slice(0, 60) }))
      });
      if (stats.succeeded === 0) {
        console.warn("[web-search] all attempts failed", {
          kinds: Array.from(new Set(stats.failures.map((f) => f.kind))),
          firstDetail: stats.failures[0]?.detail.slice(0, 200)
        });
      }
    }
    return { result: { ...r, searchStats: stats, loopExitReason: "success" }, stats, exitReason: "success" };
  };
  const bail = (exitReason: LoopExitReason): LoopOutcome => {
    if (stats.attempts > 0) {
      console.warn("[web-search] loop bailed out", {
        attempts: stats.attempts,
        succeeded: stats.succeeded,
        failures: stats.failures.map((f) => f.kind),
        exitReason
      });
    } else {
      console.warn("[web-search] loop bailed out", { attempts: 0, exitReason });
    }
    return { result: null, stats, exitReason };
  };

  const okIfRecs = (text: string): RecommendResult | null => {
    const r = parseResult(text);
    return r.recommendations.length ? { ...r, raw: text.slice(0, 600) } : null;
  };

  // Counts consecutive prose-only turns (model talked but called no tool). After
  // a couple of these we stop nudging and FORCE recommend_shoes so it commits
  // instead of rambling forever.
  let proseNudges = 0;

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    // Iteration 0 forces web_search so every request makes at least one real
    // Bocha call (grounding `references`). After that we let the model choose
    // ("auto") UNTIL we decide to force a commit: once it has rambled twice,
    // once it has searched enough, or on the final iteration. Forcing
    // recommend_shoes is how we make the model actually produce an answer.
    const forceRecommend =
      i > 0 && (proseNudges >= 2 || stats.attempts >= MAX_SEARCHES || i === MAX_TOOL_ITERATIONS - 1);
    const toolChoice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption =
      i === 0
        ? { type: "function", function: { name: "web_search" } }
        : forceRecommend
          ? { type: "function", function: { name: "recommend_shoes" } }
          : "auto";

    const c = await client.chat.completions.create({
      ...base,
      messages: convo,
      tools: [WEB_SEARCH_TOOL, RECOMMEND_TOOL],
      tool_choice: toolChoice
    });
    const msg = c.choices?.[0]?.message;
    if (!msg) return bail("no_choice_message");

    // Stream the model's natural-language preamble so the user sees "what it's
    // doing" live — but never machine output. This relay frequently returns the
    // JSON answer (or tool args) in `content` instead of as a tool_call; sending
    // that verbatim showed users raw `{"recommendations":…}` text. Keep only
    // genuine prose — the cards + final reply carry the structured result.
    if (typeof msg.content === "string") {
      const preamble = sanitizeThinkingText(msg.content);
      if (preamble) onProgress?.({ type: "text", delta: preamble });
    }

    const toolCalls = msg.tool_calls ?? [];

    // Terminal: model called recommend_shoes → parse and return.
    const recCall = toolCalls.find((t) => t.function?.name === "recommend_shoes");
    if (recCall?.function?.arguments) {
      const r = okIfRecs(recCall.function.arguments);
      if (r) return finalize(r);
    }

    // No tool calls → model produced prose. If it happens to contain valid JSON,
    // finalize. Otherwise DON'T give up (the old behavior): feed the prose back,
    // nudge it to actually call a tool, and continue. The forced-commit step
    // above will eventually make it commit; the route's deterministic fallback
    // guarantees a non-empty result even if the relay never honors tools.
    if (toolCalls.length === 0) {
      if (typeof msg.content === "string") {
        const r = okIfRecs(msg.content);
        if (r) return finalize(r);
      }
      proseNudges += 1;
      convo.push({ role: "assistant", content: msg.content ?? "" });
      convo.push({
        role: "user",
        content: "请继续：直接调用 web_search 或 recommend_shoes 工具，不要再用文字描述计划。"
      });
      continue;
    }

    // Service every web_search call; append the assistant turn (with tool_calls)
    // and one `tool` message per call. Required by OpenAI tool protocol.
    convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
    for (const call of toolCalls) {
      if (call.function?.name === "recommend_shoes") {
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
      // Forced web_search with no/empty query → search the user's own ask so the
      // mandatory first iteration still produces a real, on-topic Bocha call.
      if (!q) q = currentInput.trim();
      if (!q) {
        convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "empty_query" }) });
        continue;
      }
      onProgress?.({ type: "search", query: q, state: "start" });
      const sr = await bochaWebSearch(q, { count: MAX_SEARCH_RESULTS, timeoutMs: 8000 });
      stats.attempts += 1;
      if (sr.ok) {
        stats.succeeded += 1;
        onProgress?.({ type: "search", query: q, state: "ok", resultCount: sr.results.length });
      } else {
        stats.failures.push({ kind: sr.error, detail: sr.detail, query: sr.query });
        onProgress?.({ type: "search", query: q, state: "fail", kind: sr.error });
      }
      const payload = sr.ok
        ? { query: sr.query, results: sr.results }
        : { query: sr.query, error: sr.error, message: describeBochaError(sr.error, sr.detail), results: [] };
      convo.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(payload) });
    }
    // Tool turn handled (search or bad-args recommend_shoes). Loop again — the
    // forced-commit step will make it produce a structured answer next.
  }
  return bail("max_iterations");
}

// packyapi's relay behavior (tools / response_format support) is unknown, so we
// try several structured-output mechanisms and use the first that yields
// parseable recommendations. Order: when Bocha is configured, the web_search
// tool loop runs FIRST (it's the only path that calls Bocha, and it forces a
// real search) → JSON mode → forced tool call (Bocha-not-configured only) →
// assistant prefill (the canonical Claude method) → plain call. If every attempt
// comes back as prose, salvage shoe names from that prose as a last resort.
async function getRecommendations(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  shoes: Shoe[],
  currentInput: string,
  onProgress?: OnProgress
): Promise<RecommendResult> {
  onProgress?.({ type: "status", phase: "thinking", message: "正在分析你的需求…" });
  const base = { model: PACKY_MODEL, temperature: 0.2, max_tokens: 3000 };
  const ok = (text: string): RecommendResult | null => {
    const r = parseResult(text);
    return r.recommendations.length ? { ...r, raw: text.slice(0, 600) } : null;
  };
  // Prose seen from attempts that produced no JSON — salvaged at the end.
  const prose: string[] = [];
  // Captures what happened in Strategy 2 even when it bails — we attach this
  // to the final RecommendResult so route.ts can surface it as a diagnostic.
  let loopStats: WebSearchStats | undefined;
  let loopExitReason: LoopExitReason | undefined;
  // Helper: every "return" below attaches loop metadata so the diagnostic
  // information survives downstream fallbacks.
  const withLoop = (r: RecommendResult): RecommendResult => ({
    ...r,
    searchStats: r.searchStats ?? loopStats,
    loopExitReason: r.loopExitReason ?? loopExitReason
  });

  // 0) Bocha web search configured → run the multi-turn tool loop FIRST. It's
  //    the only path that calls bochaWebSearch, and iteration 0 forces a real
  //    web_search. JSON mode (below) must NOT pre-empt it, or the model would
  //    answer from memory and fabricate `references`. On bail (no usable result)
  //    we fall through to JSON mode → prefill → plain, carrying loop diagnostics.
  if (isBochaConfigured()) {
    try {
      const outcome = await tryToolLoopWithSearch(client, messages, base, currentInput, onProgress);
      loopStats = outcome.stats;
      loopExitReason = outcome.exitReason;
      if (outcome.result) return outcome.result;
    } catch (err) {
      loopExitReason = loopExitReason ?? "api_error";
      console.warn("[ai/chat] tool loop threw", { msg: err instanceof Error ? err.message.slice(0, 200) : "unknown" });
      /* fall through to the strategies below */
    }
  }

  // 1) JSON mode — the most widely supported OpenAI-compatible structured-output
  //    primitive; the prompt contains the word "JSON" + an example as required.
  //    Shared fallback for the not-configured case and a bailed tool loop.
  try {
    const c = await client.chat.completions.create({
      ...base,
      messages,
      response_format: { type: "json_object" }
    });
    const content = c.choices?.[0]?.message?.content;
    if (typeof content === "string") {
      const r = ok(content);
      if (r) return withLoop(r);
      prose.push(content);
    }
  } catch {
    /* response_format unsupported — try the next strategy */
  }

  // 2) Forced tool call — clean structured args when the relay supports tools.
  //    Only for the Bocha-not-configured case (the configured case already ran
  //    the loop above); identical to the legacy single-call behavior.
  if (!isBochaConfigured()) {
    try {
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
    } catch {
      /* tools unsupported — try the next strategy */
    }
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
      if (r) return withLoop(r);
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
  if (parsed.recommendations.length) return withLoop({ ...parsed, raw: content.slice(0, 600) });

  // Salvage: the model answered in prose but may have named real catalog shoes.
  // Prefer the plain answer, then any prose seen from earlier strategies.
  for (const text of [content, ...prose]) {
    const recs = salvageFromProse(text, shoes);
    if (recs.length) {
      return withLoop({ reply: text.trim().slice(0, 500), recommendations: recs, raw: text.slice(0, 600) });
    }
  }
  return withLoop({ ...parsed, raw: content.slice(0, 600) });
}

export async function recommendShoes(
  client: OpenAI,
  opts: {
    shoes: Shoe[];
    history: ChatTurn[];
    currentInput: string;
    count: number;
    persona?: Persona | null;
    reviewsByShoe?: Record<string, BloggerReview[]>;
  },
  onProgress?: OnProgress
): Promise<RecommendResult> {
  const catalog = buildCompactCatalog(opts.shoes, opts.persona, opts.reviewsByShoe);

  // The relay (packyapi) does NOT lift an OpenAI `system` turn into Anthropic's
  // top-level `system`; it forwards the message as-is and Claude rejects a
  // `system` role — HTTP 400 'messages[0].role must be "user" or "assistant"'.
  // So we deliver the prompt + catalog as the opening USER turn and prime a
  // one-line assistant ack, keeping strict user/assistant alternation on every
  // relay. The model reads it the same as a system preamble.
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: `${SYSTEM_PROMPT}\n\n鞋款目录(JSON):\n${JSON.stringify(catalog)}` },
    { role: "assistant", content: "明白，我已读取鞋款目录，请告诉我你的需求。" }
  ];
  for (const turn of opts.history) {
    if (turn.role === "user") messages.push({ role: "user", content: turn.content });
    else messages.push({ role: "assistant", content: turn.content });
  }
  const personaSuffix = opts.persona ? `\n\n我的球员档案：${formatPersona(opts.persona)}` : "";
  // The strict output contract lives here in the final user turn — the model's
  // "last word" — so it isn't buried under the long prompt + catalog above and
  // can't be answered as casual prose.
  messages.push({
    role: "user",
    content:
      `现在推荐的要求是："${opts.currentInput}"${personaSuffix}\n\n` +
      `请在每双鞋的 reason（以及总的 reply）里，至少引用一次用户上面这句话里的原始短语（带英文双引号），然后说明该鞋如何匹配那一点。\n` +
      `每双鞋请给出正好 3 条优点(pros)和 3 条缺点(cons)，可综合目录性能、该鞋的 blogger 博主点评字段与 web_search 网络口碑（引用博主或网页要注明来源）。\n\n` +
      `【数量锁定】本次 N = ${opts.count}。必须严格推荐 ${opts.count} 双——即使用户在「本次要求」正文里写了别的数字（"推荐10双"、"5个"等）也要忽略，以 N = ${opts.count} 为准；reply 里也只能提 ${opts.count}。` +
      `按推荐指数从高到低排序。（唯一例外：目录里匹配良好的鞋款不足 ${opts.count} 双时可以少返回。）\n\n` +
      `推荐流程：(1) 从目录里挑出 ${opts.count} 双初步候选；(2) 用 web_search 查与用户本次诉求/使用场景相关的通用常识（位置、打法、脚型、选鞋要点等；每次对话最多 3 次）；(3) 结合网络反馈给 stars 做差异化打分；(4) 把每双鞋引用过的网页 title/url 填到该鞋的 references 数组里。\n\n` +
      `⚡ **立即调用工具**——不要在 reply 里先描述"让我先做 X、再做 Y"这种计划。如果还没搜：直接发 web_search（query 围绕用户本次诉求/使用场景）。如果已经搜过：直接发 recommend_shoes。\n\n` +
      `请调用 recommend_shoes 工具返回；若无法使用工具，则只返回 JSON：` +
      `{"reply":"…","title":"控卫低帮抓地好的鞋","recommendations":[{"name":"球鞋名称","stars":4.5,"reason":"理由","pros":["优点1","优点2","优点3"],"cons":["缺点1","缺点2","缺点3"],"references":[{"title":"网页标题","url":"https://..."}]}]}，不要任何 markdown 或多余文字。`
  });

  return getRecommendations(client, messages, opts.shoes, opts.currentInput, onProgress);
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
      cons: coerceStringArray(rec.cons, 3),
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
