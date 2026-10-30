import { shuffleWallItems } from "./wall-motion";
import { DIM_KEYS, hasPerformanceEvidence } from "@/lib/star-rating";
import type { Shoe, ShoeSpec } from "@/lib/types";
import type { WallPopularity } from "./server-wall-popularity";

export type OnboardingCatalogShoe = {
  name: string; brand: string; image: string; slug: string; shoe: Shoe;
};

const SPEC_TEXT_FIELDS = [
  "forefoot_midsole_tech", "heel_midsole_tech", "outsole_tech", "upper_tech",
  "cushioning_feel", "court_feel", "bounce", "stability", "traction", "fit",
  "containment", "support", "torsional_rigidity", "playstyle_summary", "story_summary",
  "forefoot_midsole_tech_zh", "heel_midsole_tech_zh", "outsole_tech_zh", "upper_tech_zh",
  "cushioning_feel_zh", "court_feel_zh", "bounce_zh", "stability_zh", "traction_zh", "fit_zh",
  "containment_zh", "support_zh", "torsional_rigidity_zh", "playstyle_summary_zh", "story_summary_zh",
  "pro_summary", "pro_summary_zh", "con_summary", "con_summary_zh"
] as const satisfies readonly (keyof ShoeSpec)[];

function publicSpecOnly(spec: ShoeSpec): ShoeSpec {
  // An explicit allowlist also strips runtime fields (shoe_id, source metadata,
  // historical versions) that may exist despite the compile-time ShoeSpec type.
  const result: ShoeSpec = Object.fromEntries(SPEC_TEXT_FIELDS.flatMap((key) => {
    const value = spec[key];
    return typeof value === "string" || value === null ? [[key, value]] : [];
  }));
  if (Array.isArray(spec.tags)) result.tags = spec.tags.filter((tag): tag is string => typeof tag === "string");
  return result;
}

function quality(shoe: Shoe) {
  // Exactly the existing hasCompletePerformance predicate. Import its shared
  // data primitives instead of calling a function in a "use client" module.
  const complete = DIM_KEYS.every((key) => hasPerformanceEvidence(shoe.spec?.[key]));
  const cutout = /-nobg\.[a-z0-9]+(?:[?#]|$)/i.test(shoe.image_url || "");
  return (complete ? 0 : 2) + (cutout ? 0 : 1);
}

function sampleByBrand(shoes: Shoe[], limit: number, random: () => number) {
  const sorted = shuffleWallItems(shoes, random).sort((a, b) => quality(a) - quality(b));
  // All images above are already resolved to approved images by getPublicShoes.
  // Round-robin through brands so one large catalogue cannot fill the wall.
  const groups = new Map<string, Shoe[]>();
  for (const shoe of sorted) {
    const key = shoe.brand.toLocaleLowerCase("en-US");
    const group = groups.get(key) ?? [];
    group.push(shoe);
    groups.set(key, group);
  }
  const selected: Shoe[] = [];
  const selectedIds = new Set<string>();
  for (let index = 0; selected.length < limit; index++) {
    let added = false;
    for (const group of groups.values()) {
      const shoe = group[index];
      if (!shoe || selectedIds.has(shoe.id)) continue;
      selected.push(shoe);
      selectedIds.add(shoe.id);
      added = true;
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected;
}

export function buildOnboardingCatalog(shoes: Shoe[], limit = 25, random: () => number = Math.random, popularity?: WallPopularity) {
  const eligible = [...new Map(shoes.filter(shoe => shoe.image_url?.trim()).map(shoe => [shoe.id, shoe])).values()];
  const count = Math.min(Math.max(0, Math.floor(limit)), eligible.length);
  const popularTarget = Math.round(count * .8);
  const viewsBySlug = popularity?.viewsBySlug ?? new Map<string, number>();
  // Vercel's busiest 100 detail paths are a traffic-backed candidate report.
  // Randomize equal counts; sample 20 from its 25 most-viewed eligible shoes.
  // Shoes outside this pool are exploration picks, not invented zero-view data.
  const ranked = shuffleWallItems(eligible.filter(shoe => (viewsBySlug.get(shoe.slug) ?? 0) > 0), random)
    .sort((a, b) => (viewsBySlug.get(b.slug) ?? 0) - (viewsBySlug.get(a.slug) ?? 0));
  // Keep enough distinct shoes outside the popular pool for small catalogues.
  const poolSize = Math.min(ranked.length, count, eligible.length - (count - popularTarget));
  const popularPool = ranked.slice(0, poolSize);
  const popularIds = new Set(popularPool.map(shoe => shoe.id));
  const popular = sampleByBrand(popularPool, popularTarget, random);
  const discovery = sampleByBrand(eligible.filter(shoe => !popularIds.has(shoe.id)), count - popular.length, random);
  const selected = shuffleWallItems([...popular, ...discovery], random);
  const candidates: OnboardingCatalogShoe[] = selected.map((source) => {
    const shoe: Shoe = {
      id: source.id, slug: source.slug, shoe_name: source.shoe_name,
      brand: source.brand, image_url: source.image_url,
      spec: publicSpecOnly(source.spec ?? {}),
      weight: source.weight ?? null, release_year: source.release_year ?? null
    };
    return { name: shoe.shoe_name, brand: shoe.brand, image: source.image_url!, slug: shoe.slug, shoe };
  });
  return {
    shoes: candidates, shoeCount: shoes.length, brandCount: new Set(shoes.map((shoe) => shoe.brand)).size,
    selection: {
      source: "vercel", status: popularity?.status ?? "unavailable", periodDays: 30,
      asOf: popularity?.asOf ?? null, popularCount: popular.length, discoveryCount: discovery.length
    }
  };
}
