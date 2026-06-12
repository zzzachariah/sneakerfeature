import type { SupabaseClient } from "@supabase/supabase-js";
import type OpenAI from "openai";
import {
  SPEC_TRANSLATABLE_FIELDS,
  STORY_TRANSLATABLE_FIELDS,
  hasText,
  zhColumn
} from "@/lib/ai/translatable-fields";
import { translateFieldsToZh, type TranslatableField } from "@/lib/ai/translate-content";

// Drives the admin "one-click translate everything" panel. State lives entirely
// in the `*_zh` columns (null = not yet translated), so there is no job table:
// each tick recomputes what's still pending and processes the next shoe. The
// client accumulates processed shoe ids in `excludeIds` so a run always
// terminates (even when a shoe fails or `force` re-translates already-done rows).

type Row = Record<string, string | null>;

export type ShoeTranslationWork = {
  shoeId: string;
  label: string;
  specRowId: string | null;
  storyRowId: string | null;
  // keys are English column names on shoe_specs / shoe_stories
  fields: TranslatableField[];
};

export type TranslationState = {
  totalShoes: number;
  // pending shoes NOT in excludeIds (i.e. still to do this run)
  pendingCount: number;
  next: ShoeTranslationWork | null;
};

const SPEC_FIELD_SET = new Set<string>(SPEC_TRANSLATABLE_FIELDS);

function shoeLabel(shoe: Row): string {
  const label = [shoe.brand, shoe.shoe_name].filter(hasText).join(" ").trim();
  return label || String(shoe.id ?? "");
}

// Fields on a row still needing translation. force → every field with English
// text; otherwise only English fields whose `_zh` counterpart is still empty.
function pendingFieldsOf(row: Row | null, fieldNames: readonly string[], force: boolean): TranslatableField[] {
  if (!row) return [];
  const out: TranslatableField[] = [];
  for (const name of fieldNames) {
    const en = row[name];
    if (!hasText(en)) continue;
    if (!force && hasText(row[zhColumn(name)])) continue;
    out.push({ key: name, text: en });
  }
  return out;
}

function columnList(base: string[], fields: readonly string[]): string {
  return [...base, ...fields, ...fields.map(zhColumn)].join(", ");
}

export async function loadTranslationState(
  supabase: SupabaseClient,
  opts: { force?: boolean; excludeIds?: string[] } = {}
): Promise<TranslationState> {
  const force = Boolean(opts.force);
  const exclude = new Set(opts.excludeIds ?? []);

  const [shoesRes, specsRes, storiesRes] = await Promise.all([
    supabase.from("shoes").select("id, brand, shoe_name"),
    supabase.from("shoe_specs").select(columnList(["id", "shoe_id"], SPEC_TRANSLATABLE_FIELDS)),
    supabase.from("shoe_stories").select(columnList(["id", "shoe_id", "created_at"], STORY_TRANSLATABLE_FIELDS))
  ]);

  if (shoesRes.error) throw shoesRes.error;
  if (specsRes.error) throw specsRes.error;
  // shoe_stories is optional — a missing/empty table shouldn't abort the run.

  const specByShoe = new Map<string, Row>();
  for (const r of (specsRes.data ?? []) as unknown as Row[]) {
    const sid = r.shoe_id;
    if (sid && !specByShoe.has(sid)) specByShoe.set(sid, r);
  }

  // Latest story per shoe (mirror lib/data/shoes buildStoryMap: created_at desc).
  const storyByShoe = new Map<string, Row>();
  const stories = [...((storiesRes.data ?? []) as unknown as Row[])].sort((a, b) => {
    const at = a.created_at ? Date.parse(a.created_at) : 0;
    const bt = b.created_at ? Date.parse(b.created_at) : 0;
    return bt - at;
  });
  for (const r of stories) {
    const sid = r.shoe_id;
    if (sid && !storyByShoe.has(sid)) storyByShoe.set(sid, r);
  }

  const shoes = (shoesRes.data ?? []) as Row[];
  let pendingCount = 0;
  let next: ShoeTranslationWork | null = null;

  for (const shoe of shoes) {
    const shoeId = shoe.id;
    if (!shoeId || exclude.has(shoeId)) continue;

    const spec = specByShoe.get(shoeId) ?? null;
    const story = storyByShoe.get(shoeId) ?? null;
    const fields = [
      ...pendingFieldsOf(spec, SPEC_TRANSLATABLE_FIELDS, force),
      ...pendingFieldsOf(story, STORY_TRANSLATABLE_FIELDS, force)
    ];
    if (fields.length === 0) continue;

    pendingCount += 1;
    if (!next) {
      next = {
        shoeId,
        label: shoeLabel(shoe),
        specRowId: spec?.id ?? null,
        storyRowId: story?.id ?? null,
        fields
      };
    }
  }

  return { totalShoes: shoes.length, pendingCount, next };
}

// Translate one shoe's pending fields and write the `*_zh` columns. Returns the
// number of fields written (0 → the model produced nothing usable; the caller
// surfaces that as a soft failure so the shoe is retried on a later run).
export async function translateAndStore(
  adminClient: SupabaseClient,
  packy: OpenAI,
  work: ShoeTranslationWork
): Promise<number> {
  const zh = await translateFieldsToZh(packy, work.fields);
  const keys = Object.keys(zh);
  if (keys.length === 0) return 0;

  const specUpdate: Record<string, string> = {};
  const storyUpdate: Record<string, string> = {};
  for (const key of keys) {
    if (SPEC_FIELD_SET.has(key)) specUpdate[zhColumn(key)] = zh[key];
    else storyUpdate[zhColumn(key)] = zh[key];
  }

  let written = 0;
  if (work.specRowId && Object.keys(specUpdate).length > 0) {
    written += Object.keys(specUpdate).length;
    const { error } = await adminClient
      .from("shoe_specs")
      .update({ ...specUpdate, updated_at: new Date().toISOString() })
      .eq("id", work.specRowId);
    if (error) throw error;
  }
  if (work.storyRowId && Object.keys(storyUpdate).length > 0) {
    written += Object.keys(storyUpdate).length;
    const { error } = await adminClient.from("shoe_stories").update(storyUpdate).eq("id", work.storyRowId);
    if (error) throw error;
  }
  return written;
}
