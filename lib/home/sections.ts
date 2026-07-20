// Reorderable home sections (member personalization). Small + client-safe so
// both the home view and the settings UI share one list.

export type HomeSectionId = "for-you" | "closet" | "collections" | "database";

export const HOME_SECTIONS: { id: HomeSectionId; label: string }[] = [
  { id: "for-you", label: "为你推荐" },
  { id: "closet", label: "我的鞋柜" },
  { id: "collections", label: "精选场景" },
  { id: "database", label: "全部鞋款" }
];

export const DEFAULT_HOME_ORDER: HomeSectionId[] = ["for-you", "closet", "collections", "database"];

// Sanitize a saved preference into a full, de-duplicated order: keep known ids
// in the member's order, then append any defaults they didn't include.
export function resolveHomeOrder(pref: string[] | undefined | null): HomeSectionId[] {
  const known = new Set<string>(DEFAULT_HOME_ORDER);
  const seen = new Set<string>();
  const out: HomeSectionId[] = [];
  for (const id of pref ?? []) {
    if (known.has(id) && !seen.has(id)) {
      out.push(id as HomeSectionId);
      seen.add(id);
    }
  }
  for (const id of DEFAULT_HOME_ORDER) if (!seen.has(id)) out.push(id);
  return out;
}
