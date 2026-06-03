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
