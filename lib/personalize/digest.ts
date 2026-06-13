// Pure helpers for the weekly personalized digest. Kept free of DB/AI/Shoe
// dependencies so they are easy to reason about and unit-test.

export type DigestCompareShoe = { id: string; name: string; slug: string };
export type DigestRecommendation = {
  id: string;
  name: string;
  slug: string;
  stars: number;
  reason: string;
};

export type WeeklyDigestRecord = {
  compare_shoes: DigestCompareShoe[];
  recommendations: DigestRecommendation[];
  push_title: string | null;
  push_body: string | null;
  deep_link: string | null;
};

// The two most-recently-viewed distinct shoes, for a "remember these?" compare
// teaser. Input is shoe ids ordered most-recent first.
export function pickComparePair(viewedShoeIdsByRecency: string[]): string[] {
  const seen = new Set<string>();
  const pair: string[] = [];
  for (const id of viewedShoeIdsByRecency) {
    if (seen.has(id)) continue;
    seen.add(id);
    pair.push(id);
    if (pair.length === 2) break;
  }
  return pair;
}

// Short, enticing push copy whose only job is to pull the user back into the
// app — mirrors the plan's examples ("记得你看的 A 和 B 吗？点击对比").
export function buildPushCopy(
  compareShoes: DigestCompareShoe[],
  recommendations: DigestRecommendation[]
): { title: string; body: string; deepLink: string } {
  if (compareShoes.length === 2) {
    return {
      title: `记得你看过的 ${compareShoes[0].name} 和 ${compareShoes[1].name} 吗？`,
      body: "点击直接对比这两双 👟",
      deepLink: `/compare?ids=${compareShoes[0].id},${compareShoes[1].id}`
    };
  }
  if (recommendations.length > 0) {
    return {
      title: "本周为你挑了几双鞋",
      body: `${recommendations[0].name} 可能很适合你，进来看看？`,
      deepLink: "/for-you"
    };
  }
  return { title: "本周为你推荐", body: "进来看看为你挑的球鞋 👟", deepLink: "/for-you" };
}
