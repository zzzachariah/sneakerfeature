import Link from "next/link";
import { requireAdminPageContext } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { inspectSpecs, selectSpecVersion, type SpecVersion } from "@/lib/data/catalog-quality";
import { readAllRows } from "@/lib/data/paginate";

export default async function DataQualityPage() {
  await requireAdminPageContext();
  const db = createAdminClient();
  if (!db) return <p>Database unavailable.</p>;
  const [shoes, sources] = await Promise.all([
    readAllRows<{ id: string; shoe_name: string; shoe_specs: SpecVersion[] }>((from, to) => db.from("shoes").select("id,shoe_name,shoe_specs(*)").order("id").range(from, to)),
    readAllRows<{ shoe_id: string; source_url: string | null }>((from, to) => db.from("sources").select("shoe_id,source_url").order("id").range(from, to))
  ]);
  const sourced = new Set(sources.filter(source => source.source_url).map(source => source.shoe_id));
  const queue = shoes.map(shoe => ({ ...shoe, issues: [...inspectSpecs(shoe.shoe_specs), ...(!sourced.has(shoe.id) ? ["missing_source"] : [])] }))
    .filter(shoe => shoe.issues.length).sort((a, b) => Number(b.issues.includes("ventilation_conflict") || b.issues.includes("conflicting_versions")) - Number(a.issues.includes("ventilation_conflict") || a.issues.includes("conflicting_versions")) || b.issues.length - a.issues.length || a.shoe_name.localeCompare(b.shoe_name));
  return <div className="space-y-4">
    <h1 className="text-2xl font-semibold">Data quality / 资料审核</h1>
    <p className="text-sm soft-text">{queue.length} records need review. Flags are review leads, not automatic fact corrections. Original rows are preserved. Open a record to inspect sources and edit after verification.</p>
    <ol className="space-y-3">{queue.map(shoe => <li key={shoe.id} className="surface-card rounded-xl p-4">
      <Link className="font-semibold underline" href={`/admin/published/${shoe.id}`}>{shoe.shoe_name}</Link>
      <p className="text-sm">{shoe.issues.join(" · ")}</p>
      <p className="text-xs soft-text">{shoe.shoe_specs.length} spec rows · selected update {selectSpecVersion(shoe.shoe_specs).updated_at?.slice(0, 10) ?? "unknown"}</p>
    </li>)}</ol>
  </div>;
}
