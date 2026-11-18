import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_MODEL_CATALOG, MODEL_CATALOG_KEY, modelCatalogSchema, type ModelCatalog } from "./model-catalog";

// No process/CDN cache: a committed setting is effective on the next request.
// Each AI client pins one snapshot for its whole turn (including tool calls).
export async function getModelCatalog(): Promise<ModelCatalog> {
  const admin = createAdminClient();
  if (!admin) return DEFAULT_MODEL_CATALOG;
  const { data, error } = await admin.from("app_settings").select("value")
    .eq("key", MODEL_CATALOG_KEY).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
  if (error) throw new Error("Model configuration is temporarily unavailable");
  if (!data) return DEFAULT_MODEL_CATALOG;
  const parsed = modelCatalogSchema.safeParse(data.value);
  if (!parsed.success) throw new Error("Invalid model configuration");
  return parsed.data;
}
