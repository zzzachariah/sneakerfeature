import { unstable_cache } from "next/cache";
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
  const client = createPublicClient();
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

export const getCatalogueUpdates = unstable_cache(() => readRuns(false), ["catalogue-maintenance-runs-v1"], { revalidate: 60, tags: ["catalogue-updates"] });
export const getLatestCatalogueUpdate = unstable_cache(() => readRuns(true), ["catalogue-maintenance-latest-v1"], { revalidate: 60, tags: ["catalogue-updates"] });
