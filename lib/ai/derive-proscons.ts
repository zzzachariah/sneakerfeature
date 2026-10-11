import type { Shoe, BloggerReview } from "@/lib/types";
import { evidenceDimScores, DIM_KEYS, type EvidenceScores, type DimKey, type RatingFocus } from "@/lib/star-rating";

export type ReplyLang = "zh" | "en";

// CJK present → Chinese reply, otherwise English. Mirrors how the model picks
// its reply language from the user's words, so the deterministic fill below
// matches whatever language the AI would have used.
export function detectReplyLang(text: string): ReplyLang {
  return /[㐀-鿿]/.test(text) ? "zh" : "en";
}

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

function buildReason(scores: EvidenceScores, ranked: DimKey[], hasBlogger: boolean, lang: ReplyLang): string {
  const top = ranked.filter(k => (scores[k] ?? 0) >= 80).slice(0,2).map(k => DIM_SHORT[lang][k]);
  if (lang === "zh") return top.length
    ? `现有资料描述的优势是${top.join("、")}。这是资料估算，实际体验和合脚程度仍需确认。`
    : hasBlogger ? "可参考下面的博主体验；现有性能资料不足以给出明确结论。" : "性能资料不足，暂不能核实优缺点与适配程度。";
  return top.length ? `Catalog notes suggest strengths in ${top.join(" and ")}. This is an estimate; fit and individual experience remain unverified.`
    : hasBlogger ? "See the reviewer observations below; performance evidence is insufficient for a clear conclusion." : "Not enough performance evidence to verify strengths, weaknesses or suitability.";
}

export type DerivedDetail = { reason: string; pros: string[]; cons: string[] };

/** Use observed descriptions; never fabricate three pros/cons just to fill a card. */
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

  const scores = evidenceDimScores(shoe.spec);
  const ranked = [...DIM_KEYS].filter(k => scores[k] != null).sort((a,b) => scores[b]! - scores[a]!);
  const descriptor = (k: DimKey) => {
    const zh = shoe.spec[`${k}_zh` as keyof typeof shoe.spec];
    const value = lang === "zh" && typeof zh === "string" && zh.trim() ? zh : shoe.spec[k];
    return `${DIM_SHORT[lang][k]}: ${value?.trim()}`;
  };
  const specPros = ranked.filter(k => scores[k]! >= 80).map(descriptor);
  const specCons = ranked.filter(k => scores[k]! <= 45).reverse().map(descriptor);

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
