import OpenAI from "openai";
import type { Shoe, ShoeSpec, BloggerReview } from "@/lib/types";
import type { RecommendationItem, RecommendationRaw, RecRadarAxis, WebReference, OnProgress } from "@/lib/ai/types";
import type { Persona } from "@/lib/persona/types";
import type { FootProfile } from "@/lib/foot-scan/types";
import { computeMatchScore } from "@/lib/match/score";
import { dimScores } from "@/lib/star-rating";
import { getPerformanceLabel } from "@/lib/shoe-scoring";
import { normalizeSearchText, normalizeCompactText, rankShoeMatch } from "@/lib/search/shoe-search";
import { PACKY_MODEL } from "@/lib/ai/packy-client";
import { callOptions, hasBudget, startDeadline, type Deadline } from "@/lib/ai/budget";
import { detectReplyLang, type ReplyLang } from "@/lib/ai/derive-proscons";
import { catalogAck, languageDirective as langDirective } from "@/lib/ai/lang";
import {
  bochaWebSearch,
  describeBochaError,
  isBochaConfigured,
  type BochaErrorKind,
  type WebSearchResult
} from "@/lib/ai/web-search";

// ---------------------------------------------------------------------------
// Process-lifetime web-search cache. The same shoe gets researched over and
// over (follow-up turns, popular shoes across users on a warm instance) — a
// repeat query within the TTL is pure duplicated spend, so successful results
// are reused. Only successes are cached; failures always retry live.
// ---------------------------------------------------------------------------
const SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — review chatter doesn't move faster
const SEARCH_CACHE_MAX = 300;
const searchCache = new Map<string, { at: number; result: WebSearchResult }>();

async function cachedBochaSearch(
  query: string,
  opts?: Parameters<typeof bochaWebSearch>[1]
): Promise<WebSearchResult & { cached?: boolean }> {
  const key = query.trim();
  const hit = searchCache.get(key);
  if (hit && hit.result.ok && Date.now() - hit.at < SEARCH_CACHE_TTL_MS) {
    return { ...hit.result, cached: true };
  }
  const result = await bochaWebSearch(key, opts);
  if (result.ok) {
    if (searchCache.size >= SEARCH_CACHE_MAX) {
      const oldest = searchCache.keys().next().value;
      if (oldest !== undefined) searchCache.delete(oldest);
    }
    searchCache.set(key, { at: Date.now(), result });
  }
  return result;
}

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
  | "api_error"           // client.create threw
  | "deadline";           // the turn's wall-clock budget ran out mid-pipeline

export type RecommendResult = {
  reply: string;
  title?: string;
  /**
   * The single most useful question to ask this user next, in their language.
   * Kept OUT of `reply` on purpose: the UI renders it in its own composer box so
   * the conversation can continue with one tap, instead of the question being
   * buried in the last sentence of a wall of text.
   */
  followUp?: string;
  recommendations: ParsedRec[];
  raw?: string;
  searchStats?: WebSearchStats;
  loopExitReason?: LoopExitReason;
};

/**
 * Normalize the model's `reply` into short paragraphs.
 *
 * The pipeline asks for 2-4 blank-line-separated paragraphs, but models
 * routinely answer with one long block, or separate with single newlines, or
 * emit markdown bullets. The client renders each blank-line-separated chunk as
 * its own paragraph, so anything that arrives as a single slab is split on
 * sentence boundaries here — a purely presentational transform that never drops
 * or reorders a character of what the model actually said.
 */
const REPLY_SOFT_MAX = 190; // chars before a single-block reply is worth splitting
const REPLY_TARGET = 130;   // aim for paragraphs around this length

export function formatReplyParagraphs(reply: string): string {
  const text = reply.replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  // Already multi-paragraph (blank lines) → just tidy the spacing.
  if (/\n\s*\n/.test(text)) {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n\n");
  }
  // Single newlines (bullet lists, soft wraps) → promote them to paragraphs.
  if (text.includes("\n")) {
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1) return lines.join("\n\n");
  }
  if (text.length <= REPLY_SOFT_MAX) return text;

  // One long slab: cut after sentence-ending punctuation and regroup into
  // paragraphs of roughly REPLY_TARGET characters. Latin punctuation only counts
  // when followed by whitespace + a capital/quote, so "4.5 stars" and "e.g."
  // don't become paragraph breaks. Server-only code path — lookbehind is safe.
  const sentences = text.split(/(?<=[。！？；])\s*|(?<=[.!?])\s+(?=["'(\[]?[A-Z0-9])/u).filter(Boolean);
  if (sentences.length < 2) return text;
  const paragraphs: string[] = [];
  let current = "";
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    if (current && current.length + s.length > REPLY_TARGET) {
      paragraphs.push(current);
      current = s;
    } else if (!current) {
      current = s;
    } else {
      // No space between CJK sentences; a single space between Latin ones.
      current += (/[一-鿿。！？；]$/.test(current) ? "" : " ") + s;
    }
  }
  if (current) paragraphs.push(current);
  return paragraphs.length > 1 ? paragraphs.join("\n\n") : text;
}

const SYSTEM_PROMPT = `你是 sneakerfeature 的专业篮球鞋推荐顾问。你只能从下方「鞋款目录」(JSON 数组) 中挑选球鞋，绝不能编造目录里没有的鞋。球鞋的科技、配置、性能、参数等客观事实一律以目录为准，不得用目录之外的网络知识替换或补充；唯一的例外是**目录根本没有收录的客观信息**（最典型的是价格/售价）——当用户提出预算、价位等要求时，可按下方第 5、6 条用 web_search 查证这类信息。

【语言规则 · 最高优先级 · 高于本提示词的其他一切要求】你的**思考过程(reasoning / thinking)**和**最终输出(reply、follow_up、reason、pros、cons、title)**都必须使用与用户「本次要求」完全相同的语言：用户用中文→全程中文；用户用 English→think and write everything in English, including your reasoning stream；其他任何语言同理，始终镜像用户输入所用的语言。本提示词只是用中文写给你的说明——绝不能因为它是中文，就用中文思考或回复一个并非用中文提问的用户。若用户用英文提问，你的输出里出现任何中文字符都算本次失败（鞋款名与目录里逐字复制的科技名除外）。判断语言时以用户「本次要求」正文为准；多轮对话中以**最新一次**用户输入的语言为准。

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
- 凭空编造数值参数（厚度、重量、落差、硬度等目录里没有的数字）。（价格是例外：它不属于鞋的科技/配置参数，允许通过 web_search 查证，但同样不能凭空捏造，必须有网络来源。）

【宁缺勿编】如果某项信息目录条目里没有，就用通用、模糊的描述（如"前掌缓震到位"、"抓地表现不错"、"鞋面包裹稳定"）代替，或者干脆不提；绝不要凭空给出一个具体的科技名称来填补空白。

【优点/缺点的来源 — 数据库 + 博主点评 + 网络】reason、pros、cons 里的主观使用感受（脚感、口碑、实战优缺点）可以综合三类来源：(a) 目录里该鞋的性能字段（数据库）；(b) 该鞋目录条目里的 blogger 字段（博主点评整理好的优缺点）；(c) web_search 查到的口碑。请忠实转述、不要编造；凡引用了博主或网页的观点，就在该条末尾注明来源（如"（来源：博主点评）"或"（来源：网页 - 标题）"）。但上面【严格的事实要求】对"具体科技/配置名称"的限制依然不变——科技名只能逐字引用目录，不能用博主或网络里的说法替换、新增或改写。每双鞋请尽量给满 3 条优点和 3 条缺点。

5. 【推荐流程 — 候选优先 + 立即行动】
   **你必须立即调用 web_search 或 recommend_shoes 工具，绝对不要在 reply/content 里先用自然语言描述你的计划、步骤、或"让我先做 X"。** 计划用工具调用来体现，不用文字。
   - 还没做过 web_search 调研时：先调 web_search，query 要**围绕用户「本次要求」的使用场景/诉求**展开（位置、打法、脚型、伤病、术语、选鞋要点等目录之外的通用常识），不必拘泥于具体鞋型号名。
   - 拿到足够的网络反馈（最多 3 次 web_search）后：调用 recommend_shoes 给出最终 N 双；stars 应结合网络反馈做差异化（口碑差的下调、好的上调）。
   注意：web_search **不是** 用来"补"目录里某双鞋的科技/配置参数（这些是球鞋事实，目录是唯一来源）；web_search **是** 用来查目录里没有的两类信息：(a) 主观信息——使用场景常识、口碑、实战感受、特定场景表现等；(b) 目录未收录的客观信息——最典型的是价格/当前售价。
   【预算/价格】当用户给了预算或价位要求时（问卷生成的需求里常见"预算……"这一行），应主动用一次 web_search 查相关候选鞋的大致价格，据此做筛选与排序（超出预算的下调或排除）；在 reply/reason 里提到价格时注明来源，并说明这是网络参考价、会随时间与渠道波动。价格仅用于匹配预算，绝不能因此改动或"修正"目录里该鞋的任何科技/配置字段。

6. 【信息优先级】当网络结果与目录条目存在冲突时，永远以目录为准；网络内容仅用于补充背景常识、口碑，以及价格等目录未收录的客观信息。绝不能用网络上看到的科技名/数值去替换或"修正"目录里某双鞋的字段——这同样违反【严格的事实要求】。

7. 【网络来源标注 + references 字段】
   - 凡是来自 web_search 的内容，在那句话末尾用「（来源：网页 - <网页标题>）」标注。
   - 同时，**必须**把对应网页的 title 和 url 填到该鞋 recommendation 的 references 数组里（每双鞋自己的 references；如果某双鞋没有用到任何网页就留空数组）。
   - 不要把同一个网页重复放进同一双鞋的 references。

8. 【引用用户原话】在 reason 与 reply 中解释鞋款为何契合时，必须用引号把用户「本次要求」里的原始表述复述出来，再说明该鞋如何匹配。例如用户说"前掌宽大一点的"，你应写：『针对你说的"前掌宽大一点的"，这双鞋的鞋头加宽设计能……』。只复述用户实际写过的短语，不要意译或改写他们的措辞。

9. 【数量由 N 锁定】N（用户在界面上选定的推荐数量）是唯一的真相。即使用户在「本次要求」的正文里写了"推荐 10 双"、"给我 5 个"、"来 20 双"等数字，也必须严格按照 N 来推荐——不多不少。reply 总结里也只能提到 N 这个数字，不要复读用户写的其他数量。

10. 【对话标题 title】在输出 JSON 中同时给出 title 字段：用 6-14 个汉字（或英文 3-6 个词）凝练概括用户「本次要求」的核心诉求，作为这次对话的标题。不要加引号或标点，不要带"推荐"、"求推荐"之类的多余前后缀，直接用关键词组合（例如"控卫低帮抓地好的鞋"、"扁平足后卫缓震首选"、"low-top guard shoes with grip"）。用户用什么语言你就用什么语言。

输出 N 双，按推荐指数从高到低排序。尽量凑满 N 双；只要目录里有沾边的就返回最接近的。不要返回空列表，除非目录里没有任何篮球鞋。请用与用户「本次要求」相同的语言**思考并回复**（用户用中文就全程中文，用英文就 think and reply entirely in English），见上方【语言规则】。

11.【中文回复的表达规范】当用户用中文时，reply/reason/pros/cons 必须是自然中文，具体规则：
- 目录的内部字段名（court_feel、traction、cushioning_feel、stability、fit、bounce、forefoot_midsole 等）**绝不能**原样出现在回复里，要用中文说法：场地感/贴地感、抓地力、缓震脚感、稳定性、包裹、弹性、前掌中底 等。
- 英文的描述性评价词直接翻成中文：elite→顶级，excellent→出色，very good→很好，"firm but reactive"→"偏硬但反馈灵敏" 等。
- 科技/材料/配置的**专有名词**（Zoom Air、Cut3 ZoomX、BOOM、Lightstrike Pro、Flywire 等）仍按【严格的事实要求】逐字保留英文原文，但可以在其后用括号补一句简短中文说明，例如 "saw-blade traction pattern（锯齿状抓地纹路）"。
- 鞋款名称一律保留目录原文，不翻译。

12.【reply 的分段规范 — 必须遵守】reply **绝对不能**是一大段密不透风的文字。请写成 2-4 个自然段，段与段之间用一个空行（\\n\\n）分隔，每段只讲一件事、控制在 2-3 句以内（中文每段 ≤ 80 字，英文每段 ≤ 45 词）。推荐的分段顺序：
   - 第 1 段：用引号复述用户的原话，一句话点明你抓到的核心诉求和你的取舍权重。
   - 第 2 段：这几双为什么是这几双——它们各自的差异点（谁最贴地、谁最软、谁最便宜等），一句一双最好。
   - 第 3 段：可执行的实操提示（尺码、系带、袜子、场地、清洁等），以及什么情况下不建议买。
   不要用 markdown 标题、列表符号(-、*、1.)或加粗；就是干净的自然段。

13.【follow_up 字段 — 单独输出，不要写进 reply】另给一个 follow_up 字段：用户的信息里最缺、且最能改变推荐结果的**那一个**问题，一句话、口语化、直接对用户说（例如"你主要在室内木地板还是室外水泥场打球？"／"What's your budget range?"）。要求：
   - 只问一个问题，不要连问；不要重复用户已经说过的信息。
   - **绝对不要**把这个问题再写进 reply 的正文里——界面会把它单独渲染成一个可以直接回答的输入框，写两遍会重复。
   - 如果确实没有需要追问的关键信息了，就给空字符串 ""。
   - 语言同样跟随用户。`;

const SKILL_LABEL_ZH: Record<string, string> = {
  beginner: "初学者",
  amateur: "业余",
  semi_pro: "半职业",
  pro: "职业"
};

// The user's ask can be in any language, yet this whole prompt scaffold is
// written in Chinese — which biases the model to think and answer in Chinese
// even for a non-Chinese user. Inject an explicit, unmissable directive into
// each final-instruction turn so BOTH the reasoning stream ("思考") and the
// answer ("输出") mirror the request's own language. See lib/ai/lang.ts; it is
// emitted at the TOP and again as the LAST line of every instruction turn,
// because a directive buried above a long Chinese block kept losing to recency.
function languageDirective(input: string): string {
  return langDirective(detectReplyLang(input));
}

// Injury history from the Pro deep questionnaire — worded so the model treats
// each flag as a protective requirement, not medical advice.
const INJURY_ZH: Record<string, string> = {
  ankle: "有崴脚史(需要包裹与支撑)",
  knee: "膝盖有旧伤(需要缓震保护)",
  achilles: "跟腱易紧张(需要后跟缓冲)",
  plantar: "足底筋膜易劳损(需要足弓支撑与抗扭)"
};

// English mirrors of the profile vocabulary. The persona/foot blocks sit in the
// same user turn as the ask, so rendering them in Chinese for an English user
// was both unreadable-if-echoed and one more pull toward a Chinese answer.
const SKILL_LABEL_EN: Record<string, string> = {
  beginner: "beginner",
  amateur: "amateur",
  semi_pro: "semi-pro",
  pro: "pro"
};

const INJURY_EN: Record<string, string> = {
  ankle: "history of ankle rolls (needs lockdown and support)",
  knee: "old knee injury (needs cushioning protection)",
  achilles: "achilles tightens up easily (needs heel cushioning)",
  plantar: "plantar fascia strains easily (needs arch support and torsional rigidity)"
};

function formatPersona(persona: Persona, lang: ReplyLang = "zh"): string {
  if (lang === "en") {
    const skill = SKILL_LABEL_EN[persona.skill_level] ?? persona.skill_level;
    const injuries = persona.injuries?.length
      ? `; injuries=${persona.injuries.map((k) => INJURY_EN[k] ?? k).join(", ")}`
      : "";
    return `position=${persona.positions.join("/")}; level=${skill}; flat feet=${persona.flat_foot ? "yes" : "no"}; height=${persona.height_cm}cm; weight=${persona.weight_kg}kg${injuries}`;
  }
  const skill = SKILL_LABEL_ZH[persona.skill_level] ?? persona.skill_level;
  const injuries = persona.injuries?.length
    ? `；伤病史=${persona.injuries.map((k) => INJURY_ZH[k] ?? k).join("、")}`
    : "";
  return `位置=${persona.positions.join("/")}；水平=${skill}；扁平足=${persona.flat_foot ? "是" : "否"}；身高=${persona.height_cm}cm；体重=${persona.weight_kg}kg${injuries}`;
}

// Foot-shape profile from the Foot Scan tool — surfaced so the model can match
// last width, toe-box shape and upper volume to the user's foot.
const FOOT_WIDTH_ZH: Record<string, string> = {
  narrow: "偏窄",
  standard: "标准",
  wide: "偏宽",
  extra_wide: "超宽"
};
const INSTEP_ZH: Record<string, string> = { low: "低", normal: "正常", high: "偏高" };
const TOE_ZH: Record<string, string> = {
  egyptian: "埃及型(拇趾最长)",
  greek: "希腊型(二趾最长)",
  roman: "罗马型(前几趾齐平)",
  square: "方型(脚趾齐平)"
};
// Bunion screening — surfaced to the model only when there's a sign, framed as
// an appearance hint for last/toe-box choice (not a medical condition).
const HALLUX_ZH: Record<string, string> = { none: "无", mild: "轻度", moderate_plus: "明显" };

const FOOT_WIDTH_EN: Record<string, string> = {
  narrow: "narrow",
  standard: "standard",
  wide: "wide",
  extra_wide: "extra wide"
};
const INSTEP_EN: Record<string, string> = { low: "low", normal: "normal", high: "high" };
const TOE_EN: Record<string, string> = {
  egyptian: "Egyptian (big toe longest)",
  greek: "Greek (second toe longest)",
  roman: "Roman (front toes level)",
  square: "square (toes level)"
};
const HALLUX_EN: Record<string, string> = { none: "none", mild: "mild", moderate_plus: "noticeable" };

function formatFootProfile(fp: FootProfile, lang: ReplyLang = "zh"): string {
  if (lang === "en") {
    const w = FOOT_WIDTH_EN[fp.foot_width] ?? fp.foot_width;
    const i = INSTEP_EN[fp.instep] ?? fp.instep;
    const t = TOE_EN[fp.toe_shape] ?? fp.toe_shape;
    const hx = fp.hallux && fp.hallux !== "none" ? `; bunion signs=${HALLUX_EN[fp.hallux] ?? fp.hallux}` : "";
    const len = fp.foot_length_mm ? `; foot length≈${fp.foot_length_mm}mm` : "";
    return `foot width=${w}; instep=${i}; toe shape=${t}${hx}${len}`;
  }
  const w = FOOT_WIDTH_ZH[fp.foot_width] ?? fp.foot_width;
  const i = INSTEP_ZH[fp.instep] ?? fp.instep;
  const t = TOE_ZH[fp.toe_shape] ?? fp.toe_shape;
  const hx = fp.hallux && fp.hallux !== "none" ? `；拇趾外翻迹象=${HALLUX_ZH[fp.hallux] ?? fp.hallux}` : "";
  const len = fp.foot_length_mm ? `；脚长≈${fp.foot_length_mm}mm` : "";
  return `脚宽=${w}；脚背=${i}；脚趾型=${t}${hx}${len}`;
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

// deepseek-v4-pro (thinking mode) rejects a forced `tool_choice` with HTTP 400
// "Thinking mode does not support this tool_choice". Detect that exact family
// of errors so callers can retry once with tool_choice "auto" instead of
// abandoning the whole tool loop (which is what silently happened before).
function isToolChoiceUnsupported(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) return false;
  if (error.status !== 400) return false;
  return /tool[_\s-]?choice/i.test(error.message ?? "");
}

// Process-lifetime memo of models that rejected a forced tool_choice. Without
// it, EVERY request re-paid a guaranteed-400 probe round-trip before the auto
// retry — pure duplicated work. With it, the first request learns and every
// later request (per warm serverless instance) goes straight to "auto".
const forcedChoiceUnsupportedModels = new Set<string>();

// Gates the live reasoning stream: batches tiny token deltas into readable
// chunks, stops forever at the first sign of machine output (code fence or
// JSON), and caps the total so a runaway thinking phase can't flood the SSE
// pipe. Mirrors sanitizeThinkingText's cut heuristics, but works incrementally.
const REASONING_STREAM_CAP = 4000;
const REASONING_FLUSH_AT = 48;
// Holdback so a code fence split across deltas ("`" then "``") can't slip out.
const REASONING_HOLDBACK = 2;

function createReasoningEmitter(onProgress?: OnProgress) {
  let pending = "";
  let emittedTotal = 0;
  let stopped = false;

  const emit = (text: string) => {
    if (!text) return;
    onProgress?.({ type: "text", delta: text });
    emittedTotal += text.length;
  };

  const machineCutIndex = (text: string): number => {
    const fence = text.indexOf("```");
    const brace = text.indexOf("{");
    const arr = text.match(/\[\s*[{"]/)?.index ?? -1;
    const candidates = [fence, brace, arr].filter((i) => i >= 0);
    return candidates.length ? Math.min(...candidates) : -1;
  };

  return {
    push(delta: string) {
      if (stopped || !onProgress || !delta) return;
      pending += delta;
      const cut = machineCutIndex(pending);
      if (cut >= 0) {
        emit(pending.slice(0, cut).trimEnd());
        pending = "";
        stopped = true;
        return;
      }
      if (emittedTotal + pending.length > REASONING_STREAM_CAP) {
        emit(pending.slice(0, Math.max(0, REASONING_STREAM_CAP - emittedTotal)) + "…");
        pending = "";
        stopped = true;
        return;
      }
      if (pending.length >= REASONING_FLUSH_AT + REASONING_HOLDBACK) {
        emit(pending.slice(0, pending.length - REASONING_HOLDBACK));
        pending = pending.slice(pending.length - REASONING_HOLDBACK);
      }
    },
    finish() {
      if (stopped) return;
      stopped = true;
      if (pending && machineCutIndex(pending) < 0) emit(pending.trimEnd());
      pending = "";
    }
  };
}

// The subset of an assistant message the pipeline consumes, normalized across
// the streaming and non-streaming paths. `finishReason` distinguishes a payload
// the model chose to end ("stop"/"tool_calls") from one the relay CUT OFF
// ("length") — reasoning and answer share one max_tokens budget on this relay,
// so a long think can truncate the recommend_shoes JSON mid-array.
type StreamedMessage = {
  content: string | null;
  tool_calls?: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[];
  finishReason?: string | null;
};

// One chat completion with live progress: streams the response so the model's
// reasoning_content (deepseek thinking) is forwarded to the user as it is
// generated, and a "writing" status fires the moment the model starts emitting
// the recommend_shoes payload (that arguments stream is the single longest
// silent phase). Falls back to a plain non-streaming call when the relay
// rejects streaming for these params. Never streams `content` deltas live —
// content routinely carries JSON on this relay; the caller sanitizes it whole.
// `deadline` bounds this single call: its timeout is whatever is left of the
// turn (capped), and the SDK's automatic retry is disabled so one slow relay
// response can't quietly consume double the budget.
async function completeWithProgress(
  client: OpenAI,
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
  onProgress?: OnProgress,
  deadline?: Deadline
): Promise<StreamedMessage | null> {
  const reqOpts = callOptions(deadline);
  let stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>;
  try {
    stream = await client.chat.completions.create({ ...params, stream: true }, reqOpts);
  } catch (err) {
    // A param-level rejection (e.g. unsupported tool_choice) would fail the
    // non-streaming call identically — surface it to the caller's fallback.
    if (isToolChoiceUnsupported(err)) throw err;
    const c = await client.chat.completions.create(params, reqOpts);
    const msg = c.choices?.[0]?.message;
    return msg
      ? { content: msg.content ?? null, tool_calls: msg.tool_calls, finishReason: c.choices?.[0]?.finish_reason ?? null }
      : null;
  }

  const reasoning = createReasoningEmitter(onProgress);
  let content = "";
  let sawContent = false;
  let sawChunk = false;
  let announcedWriting = false;
  let finishReason: string | null = null;
  const partials: { id: string; name: string; args: string }[] = [];

  try {
    // Manual iteration instead of `for await`: the FIRST next() can reject
    // before any chunk arrives (connection dropped right after headers), which
    // is exactly the sawChunk===false case the catch below retries — spelled
    // out this way so static analysis sees that path too.
    const iterator = stream[Symbol.asyncIterator]();
    for (;;) {
      // The SDK's `timeout` only covers time-to-first-byte: once headers land it
      // is cleared, so a relay that trickles tokens forever would run until the
      // platform killed the function. Stop reading at the turn's deadline and
      // keep what arrived — a truncated payload is still salvageable, a dead
      // connection is not.
      if (!hasBudget(deadline, 0)) {
        console.warn("[ai/chat] stream cut at turn deadline", { model: params.model, chars: content.length });
        finishReason = finishReason ?? "length";
        try {
          await iterator.return?.();
        } catch {
          /* aborting the stream is best-effort */
        }
        break;
      }
      const step = await iterator.next();
      if (step.done) break;
      const chunk = step.value;
      sawChunk = true;
      if (chunk.choices?.[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      const think = (delta as { reasoning_content?: unknown }).reasoning_content;
      if (typeof think === "string" && think) reasoning.push(think);
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        sawContent = true;
      }
      for (const tc of delta.tool_calls ?? []) {
        const slot = (partials[tc.index ?? 0] ??= { id: "", name: "", args: "" });
        if (tc.id) slot.id = tc.id;
        if (tc.function?.name) slot.name = tc.function.name;
        if (tc.function?.arguments) slot.args += tc.function.arguments;
        if (!announcedWriting && slot.name === "recommend_shoes") {
          announcedWriting = true;
          reasoning.finish();
          onProgress?.({ type: "status", phase: "writing", message: "正在为每双鞋撰写推荐理由…" });
        }
      }
    }
  } catch (err) {
    reasoning.finish();
    // Stream died before producing anything → one plain retry; otherwise the
    // partial state is unusable and the caller's error handling takes over.
    if (!sawChunk) {
      const c = await client.chat.completions.create(params, callOptions(deadline));
      const msg = c.choices?.[0]?.message;
      return msg
        ? { content: msg.content ?? null, tool_calls: msg.tool_calls, finishReason: c.choices?.[0]?.finish_reason ?? null }
        : null;
    }
    throw err;
  }
  reasoning.finish();

  const tool_calls = partials
    .filter((t) => t && t.id && t.name)
    .map((t) => ({ id: t.id, type: "function" as const, function: { name: t.name, arguments: t.args } }));
  return { content: sawContent ? content : null, finishReason, ...(tool_calls.length ? { tool_calls } : {}) };
}

// ---------------------------------------------------------------------------
// Truncation salvage. When the model's thinking eats most of the shared
// max_tokens budget, the recommend_shoes JSON gets cut off mid-array and
// JSON.parse fails — previously that threw away EVERYTHING the model wrote and
// burned another full reasoning pass on a retry. Instead, walk the truncated
// arguments and pull out every COMPLETE `{...}` object inside the
// "recommendations" array (string/escape-aware brace matching), so a payload
// cut at shoe 4 of 5 still yields 4 grounded recommendations.
// ---------------------------------------------------------------------------
function extractCompleteArrayObjects(text: string, arrayKey: string): string[] {
  const keyAt = text.indexOf(`"${arrayKey}"`);
  if (keyAt < 0) return [];
  const arrStart = text.indexOf("[", keyAt);
  if (arrStart < 0) return [];
  const out: string[] = [];
  let depth = 0;
  let objStart = -1;
  let inString = false;
  let escaped = false;
  for (let i = arrStart + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") {
      if (depth === 0) objStart = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart >= 0) {
        out.push(text.slice(objStart, i + 1));
        objStart = -1;
      }
    } else if (ch === "]" && depth === 0) {
      break; // array closed cleanly — nothing truncated after this
    }
  }
  return out;
}

function salvageTruncatedRecs(args: string): RecommendResult | null {
  const objects = extractCompleteArrayObjects(args, "recommendations");
  const recommendations: ParsedRec[] = [];
  for (const objText of objects) {
    try {
      const r = JSON.parse(objText) as { name?: unknown; stars?: unknown; reason?: unknown; pros?: unknown; cons?: unknown; references?: unknown };
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      const refs = coerceReferences(r.references, 5);
      recommendations.push({
        name,
        stars: coerceStars(r.stars),
        reason: typeof r.reason === "string" ? r.reason.trim() : "",
        pros: coerceStringArray(r.pros, 3),
        cons: coerceStringArray(r.cons, 3),
        ...(refs.length > 0 ? { references: refs } : {})
      });
    } catch {
      /* half-written object — skip */
    }
  }
  if (!recommendations.length) return null;
  // reply/title live BEFORE the array in the schema ordering the model tends to
  // use; grab them if they parse, otherwise leave blank (route fills a default).
  // follow_up may sit on either side of the array — the regex finds it wherever
  // it landed, and its absence just means "no question this turn".
  const reply = args.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "";
  const title = args.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "";
  const followUp = args.match(/"follow_?[Uu]p"\s*:\s*"((?:[^"\\]|\\.)*)"/)?.[1] ?? "";
  const unescape = (s: string) => {
    try {
      return JSON.parse(`"${s}"`) as string;
    } catch {
      return s;
    }
  };
  return {
    reply: unescape(reply),
    ...(title ? { title: unescape(title).slice(0, 30) } : {}),
    ...(followUp ? { followUp: cleanFollowUp(unescape(followUp)) } : {}),
    recommendations
  };
}

// Tidy the model's follow-up question: single line, no leading bullet/quote
// noise, hard-capped so a model that ignores "one sentence" can't push a
// paragraph into the composer prompt.
const FOLLOW_UP_MAX = 160;

function cleanFollowUp(value: unknown): string {
  if (typeof value !== "string") return "";
  const first = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)[0];
  if (!first) return "";
  return first
    .replace(/^[-*•\d.)\s]+/, "")
    .replace(/^[「『"'“”]+|[」』"'“”]+$/g, "")
    .trim()
    .slice(0, FOLLOW_UP_MAX);
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
      const parsed = JSON.parse(raw) as {
        reply?: unknown;
        title?: unknown;
        follow_up?: unknown;
        followUp?: unknown;
        recommendations?: unknown;
      };
      const reply = typeof parsed.reply === "string" ? parsed.reply : "";
      // snake_case is what the schema asks for; accept camelCase too — models
      // normalize key style often enough that rejecting it silently dropped the
      // question and the UI fell back to a generic prompt.
      const followUp = cleanFollowUp(parsed.follow_up ?? parsed.followUp);
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
      return { reply, recommendations, ...(title ? { title } : {}), ...(followUp ? { followUp } : {}) };
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
        reply: {
          type: "string",
          description:
            "用用户的语言写的总结，必须分成 2-4 个自然段、段间用空行(\\n\\n)分隔，每段 2-3 句、只讲一件事：①复述用户原话+核心诉求 ②这几双各自的差异点 ③实操提示与不建议购买的情况。禁止一大段到底，禁止 markdown 标题/列表/加粗。"
        },
        follow_up: {
          type: "string",
          description:
            "用用户的语言写的、最值得追问的**一个**问题（一句话，直接对用户说）。绝对不要把它同时写进 reply 正文——界面会单独渲染成输入框。没有要问的就给空字符串。"
        },
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
  onProgress?: OnProgress,
  // Follow-up turns ("第一双太贵了") skip the forced first search: the thread is
  // already grounded, and re-searching every follow-up doubled Bocha calls and
  // stuffed another round of search results into the context for no new signal.
  // The model can still CHOOSE to search; refs stay trustworthy either way
  // (route only surfaces them when a search succeeded in the same turn).
  isFollowUp = false,
  deadline?: Deadline
): Promise<LoopOutcome> {
  const convo: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [...initialMessages];
  const stats: WebSearchStats = { attempts: 0, succeeded: 0, failures: [] };
  // Best partial result recovered from a truncated payload (see
  // salvageTruncatedRecs). Returned if no later iteration produces a full one —
  // a payload cut at shoe 4 of 5 beats abandoning the model's work entirely.
  let bestSalvage: RecommendResult | null = null;

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
  // Thinking-mode models (deepseek-v4-pro) reject any forced tool_choice with a
  // 400. Learned once per process (memo above), then steer with explicit
  // user-turn instructions instead — same convergence, no dead probe calls.
  let forcingSupported = !forcedChoiceUnsupportedModels.has(base.model);

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    // SEARCH PHASE. Iteration 0 of a NEW conversation forces web_search so the
    // first answer makes at least one real Bocha call (grounding `references`).
    // Follow-up turns start on "auto" (see isFollowUp above). The phase ends —
    // via the break below into the JSON commit phase — once the model has
    // rambled twice, searched enough, or iterations run out. We deliberately do
    // NOT force recommend_shoes via tool args anymore: on thinking models the
    // reasoning eats the token budget before the args, so every forced-commit
    // attempt truncated and burned a full pass (observed 3-4 wasted passes per
    // request). The commit phase below uses response_format=json_object on the
    // SAME searched context instead, which this relay handles reliably.
    // …or once the turn's wall-clock budget no longer has room for another
    // model call — the commit phase below still needs its share.
    if (i > 0 && (proseNudges >= 2 || stats.attempts >= MAX_SEARCHES || !hasBudget(deadline, 60_000))) break;
    const desiredChoice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption =
      i === 0 && !isFollowUp ? { type: "function", function: { name: "web_search" } } : "auto";

    onProgress?.(
      i === 0
        ? { type: "status", phase: "reading", message: "正在阅读鞋款目录，结合你的需求思考…" }
        : { type: "status", phase: "round", round: i + 1, message: `继续深入分析（第 ${i + 1} 轮）…` }
    );

    const attempt = (tool_choice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption) =>
      completeWithProgress(
        client,
        { ...base, messages: convo, tools: [WEB_SEARCH_TOOL, RECOMMEND_TOOL], tool_choice },
        onProgress,
        deadline
      );

    let msg: StreamedMessage | null;
    if (forcingSupported && desiredChoice !== "auto") {
      try {
        msg = await attempt(desiredChoice);
      } catch (err) {
        if (!isToolChoiceUnsupported(err)) throw err;
        forcingSupported = false;
        forcedChoiceUnsupportedModels.add(base.model);
        console.warn("[ai/chat] forced tool_choice unsupported — downgrading to auto", {
          model: base.model,
          iteration: i
        });
        msg = await attempt("auto");
      }
    } else {
      msg = await attempt("auto");
    }
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
    const wasTruncated = msg.finishReason === "length";
    if (recCall?.function?.arguments) {
      const r = okIfRecs(recCall.function.arguments);
      if (r) return finalize(r);
      // Full parse failed — usually the shared token budget ran out mid-JSON.
      // Recover every complete recommendation object and keep the richest
      // salvage seen so far, so the retries below can never end with less.
      const salvaged = salvageTruncatedRecs(recCall.function.arguments);
      if (salvaged && salvaged.recommendations.length > (bestSalvage?.recommendations.length ?? 0)) {
        bestSalvage = salvaged;
        console.warn("[ai/chat] salvaged partial payload", {
          recs: salvaged.recommendations.length,
          truncated: wasTruncated,
          argChars: recCall.function.arguments.length
        });
      }
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
        content:
          detectReplyLang(currentInput) === "zh"
            ? "请继续：直接调用 web_search 或 recommend_shoes 工具，不要再用文字描述计划。"
            : "Keep going: call the web_search or recommend_shoes tool directly — stop describing the plan in prose."
      });
      continue;
    }

    // Service every web_search call; append the assistant turn (with tool_calls)
    // and one `tool` message per call. Required by OpenAI tool protocol.
    // A failed recommend_shoes payload is echoed back as a SHORT stub, not the
    // broken multi-KB JSON — re-sending it would only burn input tokens and
    // confuse the retry.
    const echoedToolCalls = toolCalls.map((tc) =>
      tc.function?.name === "recommend_shoes"
        ? { ...tc, function: { ...tc.function, arguments: '{"omitted":"invalid_or_truncated_payload"}' } }
        : tc
    );
    convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: echoedToolCalls });
    for (const call of toolCalls) {
      if (call.function?.name === "recommend_shoes") {
        convo.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            error: wasTruncated
              ? "输出因超出长度限制被截断。请立即重新调用 recommend_shoes，并大幅精简：思考不要起草文案，reason 一句话，每条 pros/cons ≤ 12 个字。"
              : "invalid_recommendation_payload, please retry"
          })
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
      const sr = await cachedBochaSearch(q, { count: MAX_SEARCH_RESULTS, timeoutMs: 8000 });
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
    // Tool turn handled (search or spontaneous bad-args recommend_shoes).
    // Loop again — the commit phase below produces the structured answer.
  }

  // COMMIT PHASE — one (at most two) response_format=json_object call(s) on the
  // searched conversation. No tools attached to generate ANOTHER search; the
  // model just writes the final JSON. This is the path that reliably survives
  // the thinking-mode token budget, and it reuses the identical convo prefix
  // (catalog + searches), so the relay's prompt cache absorbs most input cost.
  for (let attempt = 0; attempt < 2; attempt++) {
    // Out of wall clock → stop here rather than start a call the platform will
    // kill mid-flight. Whatever was salvaged below still gets returned.
    if (!hasBudget(deadline)) {
      console.warn("[ai/chat] commit phase skipped — turn budget exhausted", { attempt });
      break;
    }
    onProgress?.({ type: "status", phase: "writing", message: "正在为每双鞋撰写推荐理由…" });
    const commitZh = detectReplyLang(currentInput) === "zh";
    convo.push({
      role: "user",
      content:
        `${languageDirective(currentInput)}\n\n` +
        (attempt === 0
          ? commitZh
            ? "信息已足够。现在只输出最终结果的 JSON 对象（结构按之前给出的：reply/follow_up/title/recommendations，含 name/stars/reason/pros/cons/references）。reply 必须分成 2-4 个自然段、段间空行分隔，每段 ≤80 字；最值得追问的一个问题单独放进 follow_up，不要重复写进 reply。不要调用工具、不要 markdown、不要 JSON 之外的任何文字。思考尽量简短，不要在思考里起草文案。"
            : "You have enough information. Now output ONLY the final JSON object (the shape given earlier: reply/follow_up/title/recommendations, each recommendation carrying name/stars/reason/pros/cons/references). `reply` must be 2-4 short paragraphs separated by blank lines, each under 45 words; put the single best question to ask next in `follow_up` and do not repeat it inside `reply`. No tool calls, no markdown, nothing outside the JSON. Keep your thinking brief — don't draft copy in your reasoning."
          : commitZh
            ? "刚才的输出被截断了。请重新输出完整 JSON，并进一步精简：reply 保留 2 段、每段 ≤40 字，reason ≤ 20 字，每条 pros/cons ≤ 10 字，其他内容一律省略。"
            : "That output was cut off. Emit the complete JSON again, much shorter: `reply` 2 paragraphs of under 25 words each, `reason` under 12 words, each pro/con under 6 words, drop everything else.") +
        `\n\n${languageDirective(currentInput)}`
    });
    let msg: StreamedMessage | null = null;
    try {
      // Keep the tools declared (the convo contains tool-role turns some relays
      // validate against) but pin tool_choice "none"; if the relay rejects that
      // combination, retry bare — json_object alone is verified working.
      msg = await completeWithProgress(
        client,
        {
          ...base,
          messages: convo,
          tools: [WEB_SEARCH_TOOL, RECOMMEND_TOOL],
          tool_choice: "none",
          response_format: { type: "json_object" }
        },
        onProgress,
        deadline
      );
    } catch {
      try {
        msg = await completeWithProgress(
          client,
          { ...base, messages: convo, response_format: { type: "json_object" } },
          onProgress,
          deadline
        );
      } catch (err) {
        console.warn("[ai/chat] commit call failed", { msg: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
        break; // fall through to salvage / bail
      }
    }
    const out = typeof msg?.content === "string" ? msg.content : "";
    const r = okIfRecs(out);
    if (r) return finalize(r);
    const salvaged = salvageTruncatedRecs(out);
    if (salvaged && salvaged.recommendations.length > (bestSalvage?.recommendations.length ?? 0)) {
      bestSalvage = salvaged;
      console.warn("[ai/chat] salvaged partial commit payload", {
        recs: salvaged.recommendations.length,
        truncated: msg?.finishReason === "length",
        chars: out.length
      });
    }
    // Echo a stub, not the broken multi-KB blob — the retry only needs to know
    // it was cut off, and re-sending the blob would just burn input tokens.
    convo.push({ role: "assistant", content: '{"omitted":"truncated_payload"}' });
  }

  // A partial salvage is still the model's own grounded work — return it rather
  // than dropping to the generic downstream strategies (each of which would
  // burn another full reasoning pass over the whole catalog).
  if (bestSalvage) {
    console.warn("[ai/chat] finishing with salvaged partial payload", { recs: bestSalvage.recommendations.length });
    return finalize(bestSalvage);
  }
  return bail(hasBudget(deadline) ? "max_iterations" : "deadline");
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
  onProgress?: OnProgress,
  isFollowUp = false,
  model: string = PACKY_MODEL,
  deadline?: Deadline
): Promise<RecommendResult> {
  onProgress?.({ type: "status", phase: "thinking", message: "正在分析你的需求…" });
  // max_tokens on this relay caps reasoning + answer TOGETHER (thinking models
  // burn completion tokens on reasoning_content first). At 3000-6000 a long
  // think truncated the JSON mid-array — parse failure, then a WHOLE retried
  // reasoning pass (the real token waste). 16000 is a ceiling, not a spend:
  // tokens are only billed as generated, and headroom means one pass finishes
  // instead of two or three being thrown away.
  const base = { model, temperature: 0.2, max_tokens: 16000 };
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
  // The turn's wall clock ran out. Return the best thing we already have (shoe
  // names salvaged from any prose seen) instead of starting another strategy —
  // the platform would kill the function mid-call and the user would get a bare
  // "request failed" after watching the model think. An empty result is fine:
  // the route tops it up with deterministic picks, so cards still come back.
  const outOfTime = (): RecommendResult => {
    console.warn("[ai/chat] turn budget exhausted — finalizing early", { model: base.model });
    onProgress?.({ type: "status", phase: "finalizing", message: "本次思考耗时较长，正在用已有结果整理推荐…" });
    for (const text of prose) {
      const recs = salvageFromProse(text, shoes);
      if (recs.length) {
        return withLoop({ reply: text.trim().slice(0, 500), recommendations: recs, loopExitReason: "deadline" });
      }
    }
    return withLoop({ reply: "", recommendations: [], loopExitReason: "deadline" });
  };

  // 0) Bocha web search configured → run the multi-turn tool loop FIRST. It's
  //    the only path that calls bochaWebSearch, and iteration 0 forces a real
  //    web_search. JSON mode (below) must NOT pre-empt it, or the model would
  //    answer from memory and fabricate `references`. On bail (no usable result)
  //    we fall through to JSON mode → prefill → plain, carrying loop diagnostics.
  if (isBochaConfigured()) {
    try {
      const outcome = await tryToolLoopWithSearch(client, messages, base, currentInput, onProgress, isFollowUp, deadline);
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
    if (!hasBudget(deadline)) return outOfTime();
    onProgress?.({ type: "status", phase: "generating", message: "正在生成推荐结果…" });
    const msg = await completeWithProgress(
      client,
      { ...base, messages, response_format: { type: "json_object" } },
      onProgress,
      deadline
    );
    if (typeof msg?.content === "string") {
      const r = ok(msg.content);
      if (r) return withLoop(r);
      prose.push(msg.content);
    }
  } catch {
    /* response_format unsupported — try the next strategy */
  }

  // 2) Forced tool call — clean structured args when the relay supports tools.
  //    Only for the Bocha-not-configured case (the configured case already ran
  //    the loop above); identical to the legacy single-call behavior. Thinking
  //    models reject the forced choice — downgrade to "auto" once, like the loop.
  if (!isBochaConfigured()) {
    try {
      if (!hasBudget(deadline)) return outOfTime();
      const attempt = (tool_choice: OpenAI.Chat.Completions.ChatCompletionToolChoiceOption) =>
        completeWithProgress(client, { ...base, messages, tools: [RECOMMEND_TOOL], tool_choice }, onProgress, deadline);
      let msg: StreamedMessage | null;
      if (forcedChoiceUnsupportedModels.has(base.model)) {
        msg = await attempt("auto"); // model already known to 400 on forcing — skip the dead probe
      } else {
        try {
          msg = await attempt({ type: "function", function: { name: "recommend_shoes" } });
        } catch (err) {
          if (!isToolChoiceUnsupported(err)) throw err;
          forcedChoiceUnsupportedModels.add(base.model);
          msg = await attempt("auto");
        }
      }
      const args = msg?.tool_calls?.[0]?.function?.arguments;
      if (typeof args === "string") {
        const r = ok(args) ?? salvageTruncatedRecs(args);
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
    if (!hasBudget(deadline)) return outOfTime();
    onProgress?.({ type: "status", phase: "generating", message: "换一种方式生成推荐…" });
    const prefill = '{"recommendations":';
    const msg = await completeWithProgress(
      client,
      { ...base, messages: [...messages, { role: "assistant", content: prefill }] },
      onProgress,
      deadline
    );
    const out = msg?.content;
    if (typeof out === "string") {
      const r = ok(prefill + out) ?? ok(out);
      if (r) return withLoop(r);
    }
  } catch {
    /* prefill not accepted — try the next strategy */
  }

  // 4) Plain call — last resort; parse whatever comes back (may be prose).
  if (!hasBudget(deadline)) return outOfTime();
  onProgress?.({ type: "status", phase: "generating", message: "再次尝试生成推荐…" });
  const msg4 = await completeWithProgress(client, { ...base, messages }, onProgress, deadline);
  const content = msg4?.content;
  if (typeof content !== "string") {
    const snippet = JSON.stringify(msg4 ?? {}).slice(0, 300);
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

export type RecommendOpts = {
  shoes: Shoe[];
  history: ChatTurn[];
  currentInput: string;
  count: number;
  persona?: Persona | null;
  footProfile?: FootProfile | null;
  reviewsByShoe?: Record<string, BloggerReview[]>;
  // Tiered routing: the model id to run this request on (defaults to the shared
  // deepseek base model), and a per-tier depth/voice block appended to the ask
  // (Free = concise, Pro = standard, Max = deep + concierge). See lib/ai/tier-prompt.ts.
  model?: string;
  depthSuffix?: string;
  /**
   * Shoes already recommended earlier in this thread, resolved to catalog names
   * by the route. Drives the follow-up prompt (deepen vs replace) and seeds the
   * shortlist, so a second turn refines the existing answer instead of starting
   * a brand-new search that happens to land on the same shoes.
   */
  priorRecommendations?: PriorRecommendations;
  /**
   * Wall-clock ceiling for the whole turn. The route sets it from the platform's
   * function-duration limit, so the pipeline finalizes on its own terms instead
   * of being killed mid-stream (see lib/ai/budget.ts).
   */
  deadline?: Deadline;
};

// Persona / foot-profile context appended to the ask in every pipeline phase.
function personaFootSuffix(
  opts: Pick<RecommendOpts, "persona" | "footProfile">,
  lang: ReplyLang = "zh"
): string {
  const zh = lang === "zh";
  const personaSuffix = opts.persona
    ? zh
      ? `\n\n我的球员档案：${formatPersona(opts.persona, lang)}`
      : `\n\nMy player profile: ${formatPersona(opts.persona, lang)}`
    : "";
  const footSuffix = opts.footProfile
    ? zh
      ? `\n我的脚型档案：${formatFootProfile(opts.footProfile, lang)}。选鞋时请据此匹配鞋楦宽窄、鞋头形状与鞋面容积（偏宽/超宽→宽楦或鞋头宽松的鞋款；脚背偏高→高帮/容积更大/可调系带；脚趾型影响鞋头形状偏好；有拇趾外翻迹象→优先宽楦与柔软可延展的鞋面、避免内侧鞋头压迫第一跖趾关节）。`
      : `\nMy foot profile: ${formatFootProfile(opts.footProfile, lang)}. Match last width, toe-box shape and upper volume to it (wide/extra-wide → wide last or a roomy toe box; high instep → mid/high cut, more volume, adjustable lacing; toe shape drives toe-box preference; bunion signs → prefer a wide last and a soft, stretchable upper that doesn't press on the first MTP joint).`
    : "";
  return personaSuffix + footSuffix;
}

// Opening turns shared by every phase: system prompt + a catalog + the chat
// history, delivered as user/assistant alternation (this relay rejects a
// `system` role — see recommendShoes).
//
// `lang` decides the priming assistant ack. That ack is the model's own most
// recent utterance before the user's ask, so a hardcoded Chinese line was a
// running start into a Chinese answer no amount of later instruction reliably
// undid — the single biggest cause of "I typed English, it replied Chinese".
function buildBaseMessages(
  catalogLabel: string,
  catalogJson: string,
  history: ChatTurn[],
  lang: ReplyLang = "zh"
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "user", content: `${SYSTEM_PROMPT}\n\n${catalogLabel}:\n${catalogJson}` },
    { role: "assistant", content: catalogAck(lang) }
  ];
  for (const turn of history) {
    messages.push(turn.role === "user" ? { role: "user", content: turn.content } : { role: "assistant", content: turn.content });
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Follow-up turns. A second message in a thread used to be prompted exactly like
// a first one — "here is the ask, return N shoes" — so the model restarted from
// scratch, re-introduced itself, and often re-listed the same shoes with the
// same words. These blocks give it the thread's actual state (what it already
// recommended) and an explicit fork: DEEPEN the existing picks, or REPLACE them,
// and say which it did.
// ---------------------------------------------------------------------------
export type PriorRecommendations = {
  /** Shoe names from the most recent assistant turn. */
  last: string[];
  /** Every shoe name recommended anywhere in this thread, oldest first. */
  all: string[];
};

function followUpBlock(prior: PriorRecommendations | undefined, lang: ReplyLang): string {
  const last = prior?.last ?? [];
  const all = prior?.all ?? [];
  if (!last.length && !all.length) {
    return lang === "zh"
      ? "【这是一次追问】用户在继续同一场对话。请把上文当作已经发生过的事：不要重新自我介绍，不要从零开始复述需求，直接顺着他这次补充的信息往下说。\n\n"
      : "[THIS IS A FOLLOW-UP] The user is continuing the same conversation. Treat everything above as already said: don't reintroduce yourself, don't restate the brief from scratch — pick up directly from the new information they just gave.\n\n";
  }
  const older = all.filter((n) => !last.includes(n));
  if (lang === "zh") {
    return (
      `【这是一次追问 — 必须承接上文】用户在继续同一场对话，上一轮你已经推荐过：${last.join("、") || "（见上文）"}。` +
      (older.length ? `更早还推荐过：${older.join("、")}。` : "") +
      "\n请先判断用户这次补充的信息**是否改变了结论**，然后二选一，并在 reply 第一段明确说出你选了哪条：\n" +
      "  (A) 结论不变 → 从已推荐的鞋里挑出最贴合新信息的 1-2 双**重点推**，把排序和 stars 拉开差距，并给出上一轮没说过的、针对新信息的更深理由（不要复制粘贴上次的措辞）。剩余名额可以保留其他老鞋。\n" +
      "  (B) 结论改变 → 明说哪几双因为什么被换掉，再给出更合适的新鞋。\n" +
      "无论哪条，都不要把上一轮的 reason/pros/cons 原样重复；已经说过的话不要再说第二遍。\n\n"
    );
  }
  return (
    `[THIS IS A FOLLOW-UP — BUILD ON WHAT YOU ALREADY SAID] The user is continuing the same conversation. Last turn you recommended: ${last.join(", ") || "(see above)"}.` +
    (older.length ? ` Earlier in this thread you also recommended: ${older.join(", ")}.` : "") +
    "\nFirst decide whether what they just added CHANGES your conclusion, then take exactly one of these paths and say which one you took in the first paragraph of `reply`:\n" +
    "  (A) Conclusion holds → single out the 1-2 already-recommended shoes that fit the new information best, spread the ranking and `stars` so the winner is obvious, and give a DEEPER reason tied to the new detail — never repeat last turn's wording. Remaining slots may keep the other previous picks.\n" +
    "  (B) Conclusion changes → say plainly which shoes are being dropped and why, then bring in the better-fitting ones.\n" +
    "Either way, never restate last turn's reason/pros/cons verbatim. Don't say the same thing twice.\n\n"
  );
}

// ---------------------------------------------------------------------------
// Candidate-first evidence pipeline (default when Bocha is configured).
//
//   A) SHORTLIST — one small json_object call over the full catalog: pick
//      count+3 candidate shoes (semantic matching is the model's job).
//   B) EVIDENCE — code fires one Bocha search PER CANDIDATE, all in parallel
//      (plus one scenario search on the first turn). No model round-trips
//      between searches, results cached process-wide.
//   C) COMMIT — one json_object call whose context carries ONLY the candidate
//      entries + the per-shoe search digests (not the whole catalog again),
//      with references restricted to a whitelist of actually-searched URLs.
//
// vs. the legacy tool loop: 2 model calls instead of 3-6, searches about the
// actual shoes instead of generic phrasing, wall-clock searches = one hop, and
// fabricated reference URLs become impossible.
// ---------------------------------------------------------------------------
const SHORTLIST_EXTRA = 3;
const MAX_CANDIDATES = 12;
const MAX_CANDIDATE_SEARCHES = 8;
const BACKUP_POOL_SIZE = 4;
const DIGEST_HITS_PER_QUERY = 2;
const DIGEST_SNIPPET_CHARS = 300;

async function candidateEvidencePipeline(
  client: OpenAI,
  opts: RecommendOpts,
  onProgress?: OnProgress,
  deadline?: Deadline
): Promise<RecommendResult | null> {
  const { shoes, history, currentInput, count } = opts;
  const base = { model: opts.model ?? PACKY_MODEL, temperature: 0.2, max_tokens: 16000 };
  const stats: WebSearchStats = { attempts: 0, succeeded: 0, failures: [] };
  const lang = detectReplyLang(currentInput);
  const zh = lang === "zh";
  const suffix = personaFootSuffix(opts, lang) + (opts.depthSuffix ?? "");
  const isFollowUp = history.length > 0;
  const priorLast = opts.priorRecommendations?.last ?? [];

  // --- A) shortlist -------------------------------------------------------
  onProgress?.({ type: "status", phase: "shortlist", message: "正在从目录圈定候选鞋款…" });
  const wanted = Math.min(Math.max(count + SHORTLIST_EXTRA, 5), Math.max(count, MAX_CANDIDATES));
  const fullCatalog = JSON.stringify(buildCompactCatalog(shoes, opts.persona, opts.reviewsByShoe));
  // On a follow-up the previous picks are pre-seeded into the candidate pool, so
  // the model can double down on them without the shortlist having to
  // rediscover them from the whole catalog.
  const shortlistFollowUpNote = !isFollowUp
    ? ""
    : priorLast.length
      ? zh
        ? `注意：这是一次追问。你上一轮推荐过 ${priorLast.join("、")}——请把其中仍然合适的**保留在候选里**，同时按用户这次补充的信息再补上更贴合的新鞋，让最终答案既有延续性又有新意。\n`
        : `Note: this is a follow-up. Last turn you recommended ${priorLast.join(", ")} — keep whichever of those still fit IN the candidate list, and add better-matching new shoes based on what the user just told you, so the final answer has both continuity and new value.\n`
      : zh
        ? "注意：这是一次追问，请结合上文已经聊过的内容来圈定候选。\n"
        : "Note: this is a follow-up — shortlist with everything already discussed above in mind.\n";
  const shortlistMessages = [
    ...buildBaseMessages(zh ? "鞋款目录(JSON)" : "Shoe catalog (JSON)", fullCatalog, history, lang),
    {
      role: "user" as const,
      content: zh
        ? `${languageDirective(currentInput)}\n\n` +
          `本次要求："${currentInput}"${suffix}\n\n` +
          shortlistFollowUpNote +
          `第一步（先不要给最终推荐）：从目录中圈定 ${wanted} 双最匹配的候选鞋，稍后我会对它们逐双联网查证口碑，再请你出最终推荐。另外再给 ${BACKUP_POOL_SIZE} 双次优先级的备选（万一候选口碑不佳时的替补）。\n` +
          `只输出 JSON：{"candidates":["鞋名1","鞋名2",…],"backups":["鞋名A","鞋名B",…]}——鞋名必须逐字复制目录里的 name 字段。不要输出任何其他内容。思考尽量简短。`
        : `${languageDirective(currentInput)}\n\n` +
          `This request: "${currentInput}"${suffix}\n\n` +
          shortlistFollowUpNote +
          `Step one (do NOT give final recommendations yet): shortlist the ${wanted} best-matching shoes from the catalog. I'll research each one on the web and then ask you for the final picks. Also give ${BACKUP_POOL_SIZE} second-tier backups in case a candidate's reputation turns out poor.\n` +
          `Output JSON only: {"candidates":["shoe name 1","shoe name 2",…],"backups":["shoe name A","shoe name B",…]} — every name copied VERBATIM from the catalog's \`name\` field. Nothing else. Keep your thinking brief.`
    }
  ];
  const msgA = await completeWithProgress(
    client,
    { ...base, messages: shortlistMessages, response_format: { type: "json_object" } },
    onProgress,
    deadline
  );
  let candidateNames: string[] = [];
  let backupNames: string[] = [];
  try {
    const parsed = JSON.parse(stripFences(msgA?.content ?? "")) as { candidates?: unknown; backups?: unknown };
    candidateNames = coerceStringArray(parsed.candidates, MAX_CANDIDATES);
    backupNames = coerceStringArray(parsed.backups, BACKUP_POOL_SIZE);
  } catch {
    /* fall through — no candidates means fall back to the legacy loop */
  }
  const seen = new Set<string>();
  const candidates: Shoe[] = [];
  // Follow-up: last turn's picks lead the candidate list whether or not the
  // shortlist thought to re-name them. They're what the user is actually
  // responding to, so they must be researched and available to double down on.
  for (const name of priorLast) {
    const shoe = matchShoeByName(name, shoes);
    if (shoe && !seen.has(shoe.id)) {
      seen.add(shoe.id);
      candidates.push(shoe);
    }
  }
  for (const name of candidateNames) {
    if (candidates.length >= MAX_CANDIDATES) break;
    const shoe = matchShoeByName(name, shoes);
    if (shoe && !seen.has(shoe.id)) {
      seen.add(shoe.id);
      candidates.push(shoe);
    }
  }
  if (candidates.length === 0) {
    console.warn("[ai/chat] shortlist produced no matchable candidates — falling back to tool loop");
    return null;
  }
  // Backup pool: researched only if the commit step finds the candidates
  // insufficient (explicitly via add_candidates, or by under-returning).
  const backups: Shoe[] = [];
  for (const name of backupNames) {
    const shoe = matchShoeByName(name, shoes);
    if (shoe && !seen.has(shoe.id)) {
      seen.add(shoe.id);
      backups.push(shoe);
    }
  }
  onProgress?.({
    type: "text",
    delta: zh
      ? `候选鞋款（${candidates.length}）：${candidates.map((s) => s.shoe_name).join("、")}` +
        (backups.length ? `\n备选（暂不查证）：${backups.map((s) => s.shoe_name).join("、")}` : "")
      : `Candidate shoes (${candidates.length}): ${candidates.map((s) => s.shoe_name).join(", ")}` +
        (backups.length ? `\nBackups (not verified yet): ${backups.map((s) => s.shoe_name).join(", ")}` : "")
  });

  // --- B) parallel evidence searches --------------------------------------
  type Probe = { label: string; query: string; result?: WebSearchResult };
  const probes: Probe[] = [];
  const runProbes = async (targets: Shoe[], includeGeneric: boolean, statusMsg: string) => {
    onProgress?.({ type: "status", phase: "searching", message: statusMsg });
    const batch: Probe[] = targets.slice(0, MAX_CANDIDATE_SEARCHES).map((s) => ({
      label: s.shoe_name,
      query: zh
        ? `${s.shoe_name} 篮球鞋 实战测评 优缺点 口碑`
        : `${s.shoe_name} basketball shoe performance review pros cons`
    }));
    const generic = currentInput.trim().slice(0, 60);
    if (includeGeneric && history.length === 0 && generic) batch.unshift({ label: generic, query: generic });
    // Bounded concurrency: an unthrottled burst of 6-9 simultaneous calls trips
    // Bocha's rate limit (observed HTTP 429). Three workers drain the queue,
    // and a rate-limited query gets ONE retry after a short backoff.
    const queue = [...batch];
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        onProgress?.({ type: "search", query: p.query, state: "start" });
        let sr = await cachedBochaSearch(p.query, { count: 3, timeoutMs: 8000 });
        if (!sr.ok && sr.error === "rate_limited") {
          await new Promise((r) => setTimeout(r, 1200));
          sr = await cachedBochaSearch(p.query, { count: 3, timeoutMs: 8000 });
        }
        p.result = sr;
        stats.attempts += 1;
        if (sr.ok) {
          stats.succeeded += 1;
          onProgress?.({ type: "search", query: p.query, state: "ok", resultCount: sr.results.length });
        } else {
          stats.failures.push({ kind: sr.error, detail: sr.detail, query: sr.query });
          onProgress?.({ type: "search", query: p.query, state: "fail", kind: sr.error });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
    probes.push(...batch);
  };
  await runProbes(candidates, true, "正在逐双联网查证实战口碑…");

  // --- C) lean commit, with ONE optional extension round -------------------
  // If the model judges the researched candidates insufficient (explicit
  // add_candidates, or it returns fewer than N), the backup pool gets the same
  // parallel research and the commit re-runs once with the extra evidence.
  const researched: Shoe[] = [...candidates];
  const researchedIds = new Set(researched.map((s) => s.id));
  let pool: Shoe[] = backups;
  let extensionUsed = false;
  let bestSalvage: RecommendResult | null = null;
  let allowedUrls = new Set<string>();

  const buildCommitMessages = (extensionNote: string) => {
    allowedUrls = new Set<string>();
    const digestBlocks: string[] = [];
    for (const p of probes) {
      if (!p.result?.ok) continue;
      const hits = p.result.results.slice(0, DIGEST_HITS_PER_QUERY);
      if (!hits.length) continue;
      const lines = hits.map((h) => {
        if (h.url) allowedUrls.add(h.url);
        return `  - ${h.title} | ${h.url}\n    ${h.snippet.slice(0, DIGEST_SNIPPET_CHARS)}`;
      });
      digestBlocks.push(`【${p.label}】\n${lines.join("\n")}`);
    }
    const digest = digestBlocks.join("\n");
    const urlList = Array.from(allowedUrls)
      .map((u) => `- ${u}`)
      .join("\n");
    const candidateCatalog = JSON.stringify(buildCompactCatalog(researched, opts.persona, opts.reviewsByShoe));
    const followUpNote = isFollowUp ? followUpBlock(opts.priorRecommendations, lang) : "";
    const jsonShape =
      `{"reply":"…","follow_up":"…","title":"…","recommendations":[{"name":"…","stars":4.5,"reason":"…","pros":["…","…","…"],"cons":["…","…","…"],"references":[{"title":"…","url":"…"}]}]}`;

    if (zh) {
      const backupNote =
        !extensionUsed && pool.length
          ? `【备选（尚未查证）】${pool.map((s) => s.shoe_name).join("、")}。若查证摘要显示候选中匹配良好的不足 ${count} 双，不要硬凑：在输出 JSON 里额外加 "add_candidates":["鞋名",…]（≤${BACKUP_POOL_SIZE} 个，从备选或目录里选），我会补充联网查证后再请你重新决定。\n\n`
          : "";
      return [
        ...buildBaseMessages("候选鞋款目录(JSON)——已按本次需求初筛", candidateCatalog, history, lang),
        {
          role: "user" as const,
          content:
            `${languageDirective(currentInput)}\n\n` +
            `现在推荐的要求是："${currentInput}"${suffix}\n\n` +
            followUpNote +
            (extensionNote ? `${extensionNote}\n\n` : "") +
            `请在每双鞋的 reason（以及总的 reply）里，至少引用一次用户上面这句话里的原始短语（带英文双引号），再说明该鞋如何匹配那一点。\n` +
            `每双鞋正好 3 条优点(pros)和 3 条缺点(cons)，可综合目录性能、blogger 博主点评与下方联网查证摘要（引用博主或网页要注明来源）。每条 pros/cons ≤ 18 个字，reason 一句话。\n\n` +
            `【reply 必须分段】reply 写成 2-4 个自然段，段间用空行(\\n\\n)分隔，每段 2-3 句、≤80 字，只讲一件事：①复述用户原话+你的取舍权重 ②这几双各自的差异点 ③实操提示与不建议购买的情况。禁止一整段到底，禁止 markdown 标题/列表/加粗。\n` +
            `【follow_up 单独给】把最值得追问的那**一个**问题放进 follow_up 字段（一句话），并且**不要**再写进 reply 正文——界面会把它渲染成一个可以直接作答的输入框。没什么可问就给 ""。\n\n` +
            `【数量锁定】本次 N = ${count}。从上面候选目录里选出最终 ${count} 双，按推荐指数从高到低排序——即使用户正文里写了别的数字也以 N = ${count} 为准（唯一例外：候选中匹配良好的不足 ${count} 双时可以少返回）。\n\n` +
            backupNote +
            (digest
              ? `【联网查证摘要】以下是刚刚对候选鞋的真实搜索结果，请据此做 stars 差异化（口碑差的下调、好的上调）并充实优缺点：\n${digest}\n\n` +
                `references 只能从下列真实网页中选取（title 与 url 都逐字复制），且只填你实际引用过的；没引用就给空数组：\n${urlList}\n\n`
              : `【联网查证摘要】本次联网查证不可用——仅依据目录与博主点评作答，所有 references 一律留空数组。\n\n`) +
            `表达规范：reason/pros/cons 里不得出现 court_feel、traction 这类内部字段名——用"场地感/贴地感、抓地力"等中文说法；elite/excellent 等评价词翻成中文；科技专有名词（Zoom Air、BOOM 等）保留原文。\n\n` +
            `只输出 JSON：${jsonShape}。不要调用工具、不要 markdown、不要 JSON 之外的文字。思考尽量简短，不要在思考里起草文案。\n\n` +
            languageDirective(currentInput)
        }
      ];
    }

    const backupNoteEn =
      !extensionUsed && pool.length
        ? `[BACKUPS — not researched yet] ${pool.map((s) => s.shoe_name).join(", ")}. If the research digests show fewer than ${count} genuinely good matches among the candidates, do NOT pad the list: add "add_candidates":["shoe name",…] (≤${BACKUP_POOL_SIZE}, from the backups or the catalog) to your JSON and I'll research them and ask you again.\n\n`
        : "";
    return [
      ...buildBaseMessages(
        "Candidate shoe catalog (JSON) — already pre-filtered for this request",
        candidateCatalog,
        history,
        lang
      ),
      {
        role: "user" as const,
        content:
          `${languageDirective(currentInput)}\n\n` +
          `The request to answer now is: "${currentInput}"${suffix}\n\n` +
          followUpNote +
          (extensionNote ? `${extensionNote}\n\n` : "") +
          `In every shoe's \`reason\` (and in the overall \`reply\`), quote at least one of the user's own phrases from the line above verbatim, in double quotes, then explain how that shoe matches it.\n` +
          `Exactly 3 \`pros\` and 3 \`cons\` per shoe, drawn from the catalog's performance fields, the \`blogger\` review points, and the web research digest below (cite the source when you use a blogger or a web page). Keep each pro/con under 12 words; \`reason\` is one sentence.\n\n` +
          `[REPLY MUST BE BROKEN UP] Write \`reply\` as 2-4 short paragraphs separated by a blank line (\\n\\n), each 2-3 sentences and under 45 words, each covering ONE thing: (1) echo the user's own words and the weighting you chose, (2) how these picks differ from each other, (3) practical notes — sizing, lacing, surface — and when NOT to buy. Never one solid block. No markdown headings, bullets or bold.\n` +
          `[FOLLOW-UP GOES IN ITS OWN FIELD] Put the single most valuable question to ask next in \`follow_up\` (one sentence) and do NOT repeat it inside \`reply\` — the interface renders it as its own answerable input box. Use "" if there's nothing worth asking.\n\n` +
          `[COUNT IS LOCKED] N = ${count} for this turn. Choose the final ${count} shoes from the candidate catalog above, sorted by recommendation score, highest first — N = ${count} wins even if the user's message names a different number. (Only exception: return fewer if there genuinely aren't ${count} good matches among the candidates.)\n\n` +
          backupNoteEn +
          (digest
            ? `[WEB RESEARCH DIGEST] Real search results just gathered for the candidates. Use them to differentiate \`stars\` (poor word-of-mouth down, strong up) and to enrich the pros/cons:\n${digest}\n\n` +
              `\`references\` may ONLY be chosen from the real pages below (copy title and url verbatim), and only the ones you actually drew on; empty array otherwise:\n${urlList}\n\n`
            : `[WEB RESEARCH DIGEST] Web research was unavailable this turn — answer from the catalog and blogger reviews alone, and leave every \`references\` array empty.\n\n`) +
          `Wording: never let internal field names (court_feel, traction, cushioning_feel…) appear in \`reason\`/\`pros\`/\`cons\` — say "court feel", "traction", "cushioning" in plain English. Technology proper nouns (Zoom Air, BOOM, Lightstrike Pro…) stay verbatim as written in the catalog.\n\n` +
          `Output JSON only: ${jsonShape}. No tool calls, no markdown, nothing outside the JSON. Keep your thinking brief — don't draft the copy inside your reasoning.\n\n` +
          languageDirective(currentInput)
      }
    ];
  };

  // Resolve the model's add_candidates (or the whole backup pool) into
  // not-yet-researched catalog shoes, capped at the pool size.
  const resolveExtras = (names: string[]): Shoe[] => {
    const requested = names.length ? names : pool.map((s) => s.shoe_name);
    const extras: Shoe[] = [];
    for (const name of requested) {
      const shoe = matchShoeByName(name, shoes);
      if (shoe && !researchedIds.has(shoe.id) && !extras.some((e) => e.id === shoe.id)) extras.push(shoe);
      if (extras.length >= BACKUP_POOL_SIZE) break;
    }
    return extras;
  };

  let commitMessages = buildCommitMessages("");
  rounds: for (let round = 0; round < 2; round++) {
    let extendThisRound = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      // No wall clock left for another commit call — keep whatever was salvaged
      // and let the caller finalize rather than get killed mid-request.
      if (!hasBudget(deadline)) {
        console.warn("[ai/chat] candidate commit skipped — turn budget exhausted", { round, attempt });
        break rounds;
      }
      onProgress?.({ type: "status", phase: "writing", message: "正在为每双鞋撰写推荐理由…" });
      const messages =
        attempt === 0
          ? commitMessages
          : [
              ...commitMessages,
              { role: "assistant" as const, content: '{"omitted":"truncated_payload"}' },
              {
                role: "user" as const,
                content: zh
                  ? "刚才的输出被截断了。请重新输出完整 JSON，并进一步精简：reply 保留 2 段、每段 ≤40 字，reason ≤ 20 字，每条 pros/cons ≤ 10 字，follow_up 一句话。"
                  : "That output was cut off. Emit the complete JSON again, much shorter: keep `reply` to 2 paragraphs of under 25 words each, `reason` under 12 words, each pro/con under 6 words, `follow_up` one short sentence."
              }
            ];
      let msg: StreamedMessage | null = null;
      try {
        msg = await completeWithProgress(
          client,
          { ...base, messages, response_format: { type: "json_object" } },
          onProgress,
          deadline
        );
      } catch (err) {
        console.warn("[ai/chat] candidate commit failed", { msg: err instanceof Error ? err.message.slice(0, 160) : "unknown" });
        break rounds;
      }
      const out = typeof msg?.content === "string" ? msg.content : "";
      const full = okIfRecsText(out);
      const parsed = full ?? salvageTruncatedRecs(out);
      if (!parsed?.recommendations.length) {
        if (msg?.finishReason === "length") continue; // truncated beyond salvage — retry briefer
        break rounds; // unparseable for some other reason — bail to the legacy loop
      }
      // References must point at pages we actually searched THIS turn — any
      // other URL is fabricated and gets dropped here, before the route's own
      // trust check even runs.
      const cleaned: RecommendResult = {
        ...parsed,
        recommendations: parsed.recommendations.map((rec) => {
          const refs = (rec.references ?? []).filter((r) => allowedUrls.has(r.url));
          return { ...rec, ...(refs.length ? { references: refs } : { references: undefined }) };
        })
      };
      if (!full) {
        // Truncated but salvageable — keep the best and retry once, briefer.
        if (cleaned.recommendations.length > (bestSalvage?.recommendations.length ?? 0)) bestSalvage = cleaned;
        continue;
      }
      // Extension trigger: the model asked for more shoes, or under-returned.
      // Skipped when the remaining wall clock can't cover another search burst
      // AND another commit call — a good answer now beats a killed request.
      if (round === 0 && !extensionUsed && hasBudget(deadline, 45_000)) {
        let addNames: string[] = [];
        try {
          addNames = coerceStringArray(
            (JSON.parse(stripFences(out)) as { add_candidates?: unknown }).add_candidates,
            BACKUP_POOL_SIZE
          );
        } catch {
          /* no add_candidates */
        }
        if (addNames.length > 0 || cleaned.recommendations.length < count) {
          const extras = resolveExtras(addNames);
          if (extras.length) {
            extensionUsed = true;
            for (const s of extras) researchedIds.add(s.id);
            researched.push(...extras);
            pool = pool.filter((s) => !researchedIds.has(s.id));
            onProgress?.({
              type: "text",
              delta: zh
                ? `候选不足，补充查证：${extras.map((s) => s.shoe_name).join("、")}`
                : `Not enough strong matches — researching backups: ${extras.map((s) => s.shoe_name).join(", ")}`
            });
            await runProbes(extras, false, `正在补充查证 ${extras.length} 双备选…`);
            commitMessages = buildCommitMessages(
              `【补充说明】上一轮你认为已查证候选中匹配良好的不足 ${count} 双（或点名了备选）。现已补充查证：${extras.map((s) => s.shoe_name).join("、")}。请综合全部查证结果重新给出最终 ${count} 双。`
            );
            extendThisRound = true;
            break; // → round 1 with the extended evidence
          }
        }
      }
      return { ...cleaned, searchStats: stats, loopExitReason: "success" };
    }
    if (!extendThisRound) break;
  }
  if (bestSalvage) {
    console.warn("[ai/chat] candidate pipeline finishing with salvaged payload", {
      recs: bestSalvage.recommendations.length
    });
    return { ...bestSalvage, searchStats: stats, loopExitReason: "success" };
  }
  console.warn("[ai/chat] candidate pipeline produced nothing usable — falling back to tool loop");
  return null;
}

// Shared "parse if it has recommendations" used by the pipeline above (the
// loop-scoped okIfRecs closures aren't visible here).
function okIfRecsText(text: string): RecommendResult | null {
  const r = parseResult(text);
  return r.recommendations.length ? { ...r, raw: text.slice(0, 600) } : null;
}

export async function recommendShoes(
  client: OpenAI,
  opts: RecommendOpts,
  onProgress?: OnProgress
): Promise<RecommendResult> {
  // Every model call in this turn runs against one shared wall-clock budget, so
  // a slow reasoning model degrades into "finalize with what we have" instead of
  // running until the platform kills the function (see lib/ai/budget.ts).
  const deadline = opts.deadline ?? startDeadline();

  // Candidate-first pipeline is the default whenever web search is available;
  // the legacy multi-strategy path below is the fallback when it can't produce
  // a usable result (shortlist unparseable, relay hiccup, …).
  if (isBochaConfigured()) {
    try {
      const viaCandidates = await candidateEvidencePipeline(client, opts, onProgress, deadline);
      if (viaCandidates) return viaCandidates;
    } catch (err) {
      console.warn("[ai/chat] candidate pipeline threw — falling back", {
        msg: err instanceof Error ? err.message.slice(0, 200) : "unknown"
      });
    }
  }

  // The fallback path below is a fresh multi-call pass over the whole catalog.
  // Starting it with no budget left guarantees the request dies mid-flight, so
  // hand back an empty result and let the route finalize with its deterministic
  // picks — the user gets cards instead of "请求失败，请稍后重试。".
  if (!hasBudget(deadline)) {
    console.warn("[ai/chat] skipping fallback strategies — turn budget exhausted", { model: opts.model ?? PACKY_MODEL });
    onProgress?.({ type: "status", phase: "finalizing", message: "本次思考耗时较长，正在用已有结果整理推荐…" });
    return { reply: "", recommendations: [], loopExitReason: "deadline" };
  }

  const lang = detectReplyLang(opts.currentInput);
  const zh = lang === "zh";
  const catalog = buildCompactCatalog(opts.shoes, opts.persona, opts.reviewsByShoe);

  // The relay (packyapi) does NOT lift an OpenAI `system` turn into Anthropic's
  // top-level `system`; it forwards the message as-is and Claude rejects a
  // `system` role — HTTP 400 'messages[0].role must be "user" or "assistant"'.
  // So we deliver the prompt + catalog as the opening USER turn and prime a
  // one-line assistant ack, keeping strict user/assistant alternation on every
  // relay. The model reads it the same as a system preamble.
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = buildBaseMessages(
    zh ? "鞋款目录(JSON)" : "Shoe catalog (JSON)",
    JSON.stringify(catalog),
    opts.history,
    lang
  );
  const profileSuffix = personaFootSuffix(opts, lang);
  const followUpNote = opts.history.length > 0 ? followUpBlock(opts.priorRecommendations, lang) : "";
  // The strict output contract lives here in the final user turn — the model's
  // "last word" — so it isn't buried under the long prompt + catalog above and
  // can't be answered as casual prose.
  messages.push({
    role: "user",
    content: zh
      ? `${languageDirective(opts.currentInput)}\n\n` +
        `现在推荐的要求是："${opts.currentInput}"${profileSuffix}\n\n` +
        followUpNote +
        `请在每双鞋的 reason（以及总的 reply）里，至少引用一次用户上面这句话里的原始短语（带英文双引号），然后说明该鞋如何匹配那一点。\n` +
        `每双鞋请给出正好 3 条优点(pros)和 3 条缺点(cons)，可综合目录性能、该鞋的 blogger 博主点评字段与 web_search 网络口碑（引用博主或网页要注明来源）。每条 pros/cons 精炼在 18 个字以内，reason 一句话即可。\n\n` +
        `【reply 必须分段】reply 写成 2-4 个自然段、段间用空行(\\n\\n)分隔，每段 2-3 句、≤80 字。禁止一整段到底，禁止 markdown 标题/列表/加粗。\n` +
        `【follow_up 单独给】最值得追问的那一个问题放进 follow_up 字段（一句话），不要重复写进 reply；没什么可问就给 ""。\n\n` +
        `【数量锁定】本次 N = ${opts.count}。必须严格推荐 ${opts.count} 双——即使用户在「本次要求」正文里写了别的数字（"推荐10双"、"5个"等）也要忽略，以 N = ${opts.count} 为准；reply 里也只能提 ${opts.count}。` +
        `按推荐指数从高到低排序。（唯一例外：目录里匹配良好的鞋款不足 ${opts.count} 双时可以少返回。）\n\n` +
        `推荐流程：(1) 从目录里挑出 ${opts.count} 双初步候选；(2) 用 web_search 查与用户本次诉求/使用场景相关的通用常识（位置、打法、脚型、选鞋要点等；每次对话最多 3 次）；(3) 结合网络反馈给 stars 做差异化打分；(4) 把每双鞋引用过的网页 title/url 填到该鞋的 references 数组里。\n\n` +
        `⚡ **立即调用工具**——不要在 reply 里先描述"让我先做 X、再做 Y"这种计划。如果还没搜：直接发 web_search（query 围绕用户本次诉求/使用场景）。如果已经搜过：直接发 recommend_shoes。\n\n` +
        `⏱️ 思考过程请精炼：选定候选后就直接调工具，不要在思考里逐字起草每双鞋的完整 reason/pros/cons 文案（那些直接写进工具参数即可）。\n\n` +
        `请调用 recommend_shoes 工具返回；若无法使用工具，则只返回 JSON：` +
        `{"reply":"第一段…\\n\\n第二段…","follow_up":"一句话追问","title":"控卫低帮抓地好的鞋","recommendations":[{"name":"球鞋名称","stars":4.5,"reason":"理由","pros":["优点1","优点2","优点3"],"cons":["缺点1","缺点2","缺点3"],"references":[{"title":"网页标题","url":"https://..."}]}]}，不要任何 markdown 或多余文字。` +
        (opts.depthSuffix ?? "") +
        `\n\n${languageDirective(opts.currentInput)}`
      : `${languageDirective(opts.currentInput)}\n\n` +
        `The request to answer now is: "${opts.currentInput}"${profileSuffix}\n\n` +
        followUpNote +
        `In every shoe's \`reason\` (and in the overall \`reply\`), quote at least one of the user's own phrases from the line above verbatim, in double quotes, then explain how that shoe matches it.\n` +
        `Give exactly 3 \`pros\` and 3 \`cons\` per shoe, drawn from the catalog's performance fields, that shoe's \`blogger\` review points, and web_search findings (cite the source when you use a blogger or a page). Keep each pro/con under 12 words; \`reason\` is one sentence.\n\n` +
        `[REPLY MUST BE BROKEN UP] Write \`reply\` as 2-4 short paragraphs separated by a blank line (\\n\\n), each 2-3 sentences and under 45 words. Never one solid block. No markdown headings, bullets or bold.\n` +
        `[FOLLOW-UP GOES IN ITS OWN FIELD] Put the single most valuable question to ask next in \`follow_up\` (one sentence); don't repeat it inside \`reply\`. Use "" if there's nothing worth asking.\n\n` +
        `[COUNT IS LOCKED] N = ${opts.count} for this turn. Recommend exactly ${opts.count} shoes — ignore any other number written in the user's message ("give me 10", "5 pairs"…); N = ${opts.count} wins, and \`reply\` may only mention ${opts.count}. ` +
        `Sort by recommendation score, highest first. (Only exception: return fewer if the catalog genuinely doesn't hold ${opts.count} good matches.)\n\n` +
        `Process: (1) shortlist ${opts.count} candidates from the catalog; (2) use web_search for general knowledge around the user's ask and context — position, playstyle, foot shape, what to look for (max 3 searches per conversation); (3) differentiate \`stars\` using what you find; (4) put each shoe's cited page titles/urls in that shoe's \`references\` array.\n\n` +
        `⚡ **Call a tool immediately** — never write "first I'll do X, then Y" into \`reply\`. Haven't searched yet? Send web_search (query built from the user's ask and context). Already searched? Send recommend_shoes.\n\n` +
        `⏱️ Keep the reasoning tight: once you've picked candidates, call the tool — don't draft each shoe's full reason/pros/cons inside your thinking (write them straight into the tool arguments).\n\n` +
        `Return via the recommend_shoes tool; if tools are unavailable, return JSON only: ` +
        `{"reply":"First paragraph…\\n\\nSecond paragraph…","follow_up":"One short question","title":"low-top guard shoes with grip","recommendations":[{"name":"shoe name","stars":4.5,"reason":"why","pros":["pro 1","pro 2","pro 3"],"cons":["con 1","con 2","con 3"],"references":[{"title":"page title","url":"https://..."}]}]} — no markdown, nothing extra.` +
        (opts.depthSuffix ?? "") +
        `\n\n${languageDirective(opts.currentInput)}`
  });

  return getRecommendations(
    client,
    messages,
    opts.shoes,
    opts.currentInput,
    onProgress,
    opts.history.length > 0,
    opts.model ?? PACKY_MODEL,
    deadline
  );
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
