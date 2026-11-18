import type { Shoe } from "@/lib/types";
import type { WebSearchHit } from "@/lib/ai/web-search";
/** Keep old shoes explicitly chosen by the visitor; otherwise start with recent
 * catalog models. A release year never implies availability or a known price. */
export function demoCandidateShoes(shoes:Shoe[],interestIds:string[],year=new Date().getUTCFullYear()) {
  return shoes.filter(s=>interestIds.includes(s.id)||!s.release_year||s.release_year>=year-6);
}
export function demoSearchQuery(shoe:Shoe) {
  return `${shoe.brand} ${shoe.shoe_name} basketball shoes performance review traction stability fit`;
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
