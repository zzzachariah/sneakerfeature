// Public model data only. Stable selector IDs preserve preferences and billing.
import { z } from "zod";
import { MODEL_IDS, PICKER_MODELS, type ModelId } from "@/lib/subscription/tiers";

export const MODEL_CATALOG_KEY = "ai_model_catalog_v1";
const entry = z.object({
  model: z.string().regex(/^claude-[a-z0-9][a-z0-9.-]{0,95}$/),
  name: z.string().trim().min(1).max(60),
  fallback: z.object({ model: z.string().regex(/^claude-[a-z0-9][a-z0-9.-]{0,95}$/), name: z.string().trim().min(1).max(60) }).strict().optional(),
}).strict();
export const modelCatalogSchema = z.object({
  version: z.literal(1),
  group: z.enum(["cc-sale", "cc-expensive"]),
  revision: z.string().min(1).max(80),
  models: z.object({ economy: entry, balanced: entry, flagship: entry }).strict(),
}).strict();
export type ModelCatalog = z.infer<typeof modelCatalogSchema>;
export const DEFAULT_MODEL_CATALOG: ModelCatalog = {
  version: 1, group: "cc-sale", revision: "2026-11-18-cc-sale",
  models: {
    economy: { model: "claude-haiku-4-5-20251001", name: "Haiku 4.5" },
    balanced: { model: "claude-sonnet-5-5", name: "Sonnet 5.5" },
    flagship: { model: "claude-fable-5-2", name: "Fable 5.2" },
  },
};
export function modelSlot(id: string): keyof ModelCatalog["models"] | null {
  if (id === MODEL_IDS.haiku) return "economy";
  if (id === MODEL_IDS.deepseek) return "balanced";
  if (id === MODEL_IDS.opus) return "flagship";
  return null;
}
export function catalogModel(catalog: ModelCatalog, id: string) {
  const slot = modelSlot(id);
  return slot ? catalog.models[slot] : null;
}
export function catalogPickerModels(catalog: ModelCatalog) {
  return PICKER_MODELS.map(m => ({ ...m, ...catalogModel(catalog, m.id), id: m.id }));
}
export function catalogModelName(catalog: ModelCatalog, id: ModelId | null): string | null {
  return id ? catalogModel(catalog, id)?.name ?? null : null;
}
