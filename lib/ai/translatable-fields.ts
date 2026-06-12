// Single source of truth for which sneaker content fields get an AI-translated
// Chinese (`*_zh`) counterpart stored in Supabase. Shared by the admin bulk
// translation job, the write-path auto-translate hook, and anything else that
// needs to agree on the field set — so the list never drifts between them.
//
// Each English column on `shoe_specs` / `shoe_stories` has a parallel `<name>_zh`
// column (migration 026). The English columns stay the source of truth; the `_zh`
// columns are derived translations and the UI falls back to English when empty.

// Free-text descriptive columns on `shoe_specs` (the 4 tech fields, the feel /
// performance descriptors, and the two summaries). Numeric ratings and `tags`
// are intentionally excluded.
export const SPEC_TRANSLATABLE_FIELDS = [
  "forefoot_midsole_tech",
  "heel_midsole_tech",
  "outsole_tech",
  "upper_tech",
  "cushioning_feel",
  "court_feel",
  "bounce",
  "stability",
  "traction",
  "fit",
  "containment",
  "support",
  "torsional_rigidity",
  "playstyle_summary",
  "story_summary"
] as const;

// Editorial story columns on `shoe_stories`.
export const STORY_TRANSLATABLE_FIELDS = ["title", "content"] as const;

export type SpecTranslatableField = (typeof SPEC_TRANSLATABLE_FIELDS)[number];
export type StoryTranslatableField = (typeof STORY_TRANSLATABLE_FIELDS)[number];

export function zhColumn(field: string): string {
  return `${field}_zh`;
}

// Treat blank strings the same as null so an empty source never counts as
// "has English" and an empty translation never counts as "already translated".
export function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
