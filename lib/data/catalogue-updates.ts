import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { readAllRows } from "@/lib/data/paginate";
import { catalogueMaintenanceRunSchema, type CatalogueMaintenanceRun, type CatalogueUpdatesResult } from "@/lib/catalogue-updates";

const COLUMNS = "id,scheduled_for,completed_at,status,report";

function validateRows(rows: unknown[]): CatalogueUpdatesResult {
  const runs: CatalogueMaintenanceRun[] = [];
  let omittedInvalidRuns = 0;
  for (const row of rows) {
    const parsed = catalogueMaintenanceRunSchema.safeParse(row);
    if (parsed.success) runs.push(parsed.data);
    else omittedInvalidRuns += 1;
  }
  return { state: rows.length > 0 && runs.length === 0 ? "unavailable" : "ready", runs, omittedInvalidRuns };
}

const readRuns = async (latestOnly: boolean): Promise<CatalogueUpdatesResult> => {
  // Public reports may be corrected after a run. Read fresh data for each request;
  // React cache only deduplicates readers during the current server render.
  const client = createPublicClient((input, init) => fetch(input, { ...init, cache: "no-store" }));
  if (!client) return { state: "unavailable", runs: [], omittedInvalidRuns: 0 };
  try {
    const query = () => client.from("catalogue_maintenance_runs").select(COLUMNS).eq("is_published", true)
      .lte("completed_at", new Date().toISOString()).eq("report->>version", "1")
      .order("scheduled_for", { ascending: false }).order("completed_at", { ascending: false }).order("id", { ascending: true });
    if (latestOnly) {
      const { data, error } = await query().limit(1);
      if (error) throw new Error("Catalogue update read failed");
      return validateRows(data ?? []);
    }
    return validateRows(await readAllRows<unknown>((from, to) => query().range(from, to), 50));
  } catch {
    // No audit payloads or infrastructure errors are returned to the public UI.
    return { state: "unavailable", runs: [], omittedInvalidRuns: 0 };
  }
};

export const getCatalogueUpdates = cache(() => readRuns(false));
export const getLatestCatalogueUpdate = cache(() => readRuns(true));

export type CatalogueMaintenanceRunResult =
  | { state: "ready"; run: CatalogueMaintenanceRun }
  | { state: "missing" }
  | { state: "unavailable" };

export const getCatalogueMaintenanceRun = cache(async (id: string): Promise<CatalogueMaintenanceRunResult> => {
  const parsedId = catalogueMaintenanceRunSchema.shape.id.safeParse(id);
  if (!parsedId.success) return { state: "missing" };

  const normalizedId = parsedId.data.toLowerCase();
  const client = createPublicClient((input, init) => fetch(input, { ...init, cache: "no-store" }));
  if (!client) return { state: "unavailable" };
  try {
    const now = new Date().toISOString();
    const { data, error } = await client.from("catalogue_maintenance_runs").select(COLUMNS)
      .eq("id", normalizedId).eq("is_published", true).lte("completed_at", now)
      .eq("report->>version", "1").maybeSingle();
    if (error) return { state: "unavailable" };
    if (!data) return { state: "missing" };

    const parsed = catalogueMaintenanceRunSchema.safeParse(data);
    if (!parsed.success || parsed.data.id.toLowerCase() !== normalizedId) return { state: "unavailable" };
    // Retain the public completion boundary even if the upstream response is stale
    // or does not honor the query filter. Never expose a future report by direct URL.
    if (Date.parse(parsed.data.completed_at) > Date.parse(now)) return { state: "missing" };
    return { state: "ready", run: parsed.data };
  } catch {
    return { state: "unavailable" };
  }
});
