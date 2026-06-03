import type { Shoe, BloggerReview } from "@/lib/types";
import { dimScores, DIM_KEYS, type DimKey, type RatingFocus } from "@/lib/star-rating";

export type ReplyLang = "zh" | "en";

// CJK present → Chinese reply, otherwise English. Mirrors how the model picks
// its reply language from the user's words, so the deterministic fill below
// matches whatever language the AI would have used.
export function detectReplyLang(text: string): ReplyLang {
  return /[㐀-鿿]/.test(text) ? "zh" : "en";
}

// Moderate, honest phrasings keyed by dimension. STRONG is applied to a shoe's
// highest-scoring dimensions, WEAK (relative wording) to its lowest — so the
// lines stay truthful even when used only to round a card out to 3 items.
const STRONG: Record<ReplyLang, Record<DimKey, string>> = {
  zh: {
    cushioning_feel: "缓震脚感不错",
    court_feel: "场地感清晰",
    bounce: "回弹到位",
    stability: "稳定性扎实",
    traction: "抓地力不错",
    fit: "包裹贴合到位"
  },
  en: {
    cushioning_feel: "Cushioning feels good",
    court_feel: "Clear court feel",
    bounce: "Good bounce",
    stability: "Solid stability",
    traction: "Good traction",
    fit: "Snug, locked-in fit"
  }
};

const WEAK: Record<ReplyLang, Record<DimKey, string>> = {
  zh: {
    cushioning_feel: "缓震相对一般",
    court_feel: "场地感相对一般",
    bounce: "回弹相对一般",
    stability: "稳定性相对一般",
    traction: "抓地相对一般",
    fit: "包裹相对一般"
  },
  en: {
    cushioning_feel: "Cushioning is comparatively average",
    court_feel: "Court feel is comparatively average",
    bounce: "Bounce is comparatively average",
    stability: "Stability is comparatively average",
    traction: "Traction is comparatively average",
    fit: "Fit is comparatively average"
  }
};

const DIM_SHORT: Record<ReplyLang, Record<DimKey, string>> = {
  zh: {
    cushioning_feel: "缓震",
    court_feel: "场地感",
    bounce: "回弹",
    stability: "稳定",
    traction: "抓地",
    fit: "包裹"
  },
  en: {
    cushioning_feel: "cushioning",
    court_feel: "court feel",
    bounce: "bounce",
    stability: "stability",
    traction: "traction",
    fit: "fit"
  }
};

const TARGET = 3;

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}]+/gu, "");
}

// Append items into `out` (capped at `limit`), skipping blanks and near-duplicates.
function pushUnique(out: string[], seen: Set<string>, items: readonly string[], limit: number) {
  for (const raw of items) {
    if (out.length >= limit) break;
    const t = (raw ?? "").trim();
    if (!t) continue;
    const key = norm(t);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
}

function buildReason(scores: Record<DimKey, number>, ranked: DimKey[], hasBlogger: boolean, lang: ReplyLang): string {
  const top = ranked.filter((k) => scores[k] >= 55).slice(0, 2).map((k) => DIM_SHORT[lang][k]);
  if (lang === "zh") {
    const src = hasBlogger ? "综合数据库性能与博主点评" : "综合数据库性能";
    return top.length
      ? `${src}，这双在${top.join("、")}方面表现突出，整体均衡，值得考虑。`
      : `${src}为你挑选，整体表现均衡，值得一试。`;
  }
  const src = hasBlogger ? "Going by its spec profile and blogger reviews" : "Going by its spec profile";
  return top.length
    ? `${src}, it stands out for ${top.join(" & ")}, with a balanced overall feel.`
    : `${src}, it's a balanced all-round pick worth a look.`;
}

export type DerivedDetail = { reason: string; pros: string[]; cons: string[] };

/**
 * Guarantee a recommendation always carries a reason + 3 pros + 3 cons, drawing
 * on — in priority order — the model's own output, real blogger-review points,
 * and the shoe's database performance profile.
 *
 * Invents no specific tech or numbers: the spec-derived lines are score-ranked
 * strength/weakness phrasings only (STRONG for the shoe's top dimensions, WEAK —
 * relative wording — for its lowest), so they stay honest even as filler.
 */
export function deriveDetail(opts: {
  shoe: Shoe;
  reviews: BloggerReview[];
  focus: RatingFocus | null;
  lang: ReplyLang;
  existing?: { reason?: string; pros?: string[]; cons?: string[] };
}): DerivedDetail {
  const { shoe, reviews, lang, existing } = opts;

  // Real, human blogger pros/cons (language-appropriate column), flattened.
  const bloggerPros: string[] = [];
  const bloggerCons: string[] = [];
  for (const r of reviews) {
    const pros = lang === "en" ? r.pros_en ?? r.pros : r.pros;
    const cons = lang === "en" ? r.cons_en ?? r.cons : r.cons;
    if (Array.isArray(pros)) bloggerPros.push(...pros);
    if (Array.isArray(cons)) bloggerCons.push(...cons);
  }

  // Rank the six dimensions by spec score: top → pros, bottom → cons.
  const scores = dimScores(shoe.spec);
  const ranked = [...DIM_KEYS].sort((a, b) => scores[b] - scores[a]);
  const specPros = ranked.map((k) => STRONG[lang][k]);
  const specCons = [...ranked].reverse().map((k) => WEAK[lang][k]);

  const pros: string[] = [];
  const prosSeen = new Set<string>();
  pushUnique(pros, prosSeen, existing?.pros ?? [], TARGET);
  pushUnique(pros, prosSeen, bloggerPros, TARGET);
  pushUnique(pros, prosSeen, specPros, TARGET);

  const cons: string[] = [];
  const consSeen = new Set<string>();
  pushUnique(cons, consSeen, existing?.cons ?? [], TARGET);
  pushUnique(cons, consSeen, bloggerCons, TARGET);
  pushUnique(cons, consSeen, specCons, TARGET);

  const reason = (existing?.reason ?? "").trim() || buildReason(scores, ranked, reviews.length > 0, lang);

  return { reason, pros, cons };
}

// A short, honest "what kind of shoe suits you" phrase, derived from the common
// spec strengths of the recommended shoes. Fills the analysis line of the reply
// when the model didn't supply one.
export function summarizeNeedFromPicks(shoes: Shoe[], lang: ReplyLang): string {
  if (!shoes.length) return lang === "zh" ? "综合性能均衡的球鞋" : "a balanced all-round shoe";
  const sum = { cushioning_feel: 0, court_feel: 0, bounce: 0, stability: 0, traction: 0, fit: 0 } as Record<DimKey, number>;
  for (const s of shoes) {
    const d = dimScores(s.spec);
    for (const k of DIM_KEYS) sum[k] += d[k];
  }
  const top = [...DIM_KEYS]
    .sort((a, b) => sum[b] - sum[a])
    .slice(0, 3)
    .map((k) => DIM_SHORT[lang][k]);
  return lang === "zh" ? `在${top.join("、")}方面表现突出的球鞋` : `a shoe strong in ${top.join(", ")}`;
}

function truncateNeed(s: string, max = 60): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/**
 * Compose the assistant's spoken answer in a fixed, reliable shape:
 *   你的需求是"…"。 / <分析：适合的球鞋特征> / 下面为你推荐 N 双：
 * The middle line is the model's `reply` (a one-line characteristics summary)
 * when present, else a deterministic phrase from the picks. The need
 * restatement and the "recommend N" line are always added here, so the
 * structure holds even when the model misbehaves or the fallback fires.
 */
export function composeStructuredReply(opts: {
  message: string;
  count: number;
  aiAnalysis: string;
  searched: boolean;
  picks: Shoe[];
  lang: ReplyLang;
}): string {
  const { message, count, aiAnalysis, searched, picks, lang } = opts;
  const need = truncateNeed(message);
  if (lang === "zh") {
    const analysis = aiAnalysis.trim()
      ? aiAnalysis.trim()
      : `${searched ? "结合你的需求和我查到的资料" : "结合你的需求"}，你需要的大致是${summarizeNeedFromPicks(picks, lang)}。`;
    return `你的需求是"${need}"。\n${analysis}\n下面为你推荐 ${count} 双：`;
  }
  const analysis = aiAnalysis.trim()
    ? aiAnalysis.trim()
    : `${searched ? "Combining your needs with what I found" : "Going by your needs"}, you want ${summarizeNeedFromPicks(picks, lang)}.`;
  return `Your request: "${need}".\n${analysis}\nHere ${count > 1 ? "are" : "is"} ${count} pick${count > 1 ? "s" : ""}:`;
}
