import type { Shoe } from "@/lib/types";
import type { WebSearchHit } from "@/lib/ai/web-search";
export function demoSearchQuery(shoe:Shoe, researchFocus = "") {
  return `${shoe.brand} ${shoe.shoe_name} basketball shoes performance review ${researchFocus || "traction stability fit"}`;
}
/** Conservative evidence gate: a source must actually name this model, with a
 * shoe/review context. Search results are never silently treated as citations. */
export function demoSourceMatches(name:string,hit:WebSearchHit) {
  const normalize=(s:string)=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
  const haystack=`${hit.title} ${hit.snippet} ${hit.url}`;
  const core=name.replace(/^(nike|adidas|under armour|jordan brand|jordan)\s+/i,"");
  const model=normalize(core);
  // A base model is not its Ultra / Pro / V2 variant. Search snippets may
  // mention both, so reject a differently named title/URL before using it.
  for(const field of [hit.title,hit.url]) {
    const value=normalize(field),at=value.indexOf(model);
    if(at>=0&&/^(ultra|pro(?!s)|elite|v[2-9]|low|high|mid|plus)/.test(value.slice(at+model.length)))return false;
  }
  return /basketball|sneaker|shoe|review|球鞋|篮球鞋|测评|评测|实战/i.test(haystack)
    && normalize(haystack).includes(model);
}

/** Recorded facts need not contain rating adjectives (e.g. a weight of 355g). */
export function hasCatalogFact(value: string | null | undefined) {
  const text = value?.trim();
  return Boolean(text && !/^(?:n\/?a|none|null|unknown|tbd|not (?:available|tested|yet added)|暂无|未知|待补充|未测试|[-—–]+)[.!。]?$/i.test(text));
}
