import type { SupabaseClient } from "@supabase/supabase-js";

/** Keep moderation names available without reading other accounts' private rows. */
export async function withPublicProfileNames<T extends Record<string, unknown>>(db: SupabaseClient, rows: T[], idField: keyof T) {
  const ids = [...new Set(rows.flatMap(row => { const id = row[idField]; return typeof id === "string" ? [id] : []; }))];
  if (!ids.length) return rows.map(row => ({ ...row, profiles: null as { username: string } | null }));
  const { data, error } = await db.from("public_profile_cards").select("id, username").in("id", ids);
  if (error) throw new Error("Public profile names unavailable");
  const names = new Map((data ?? []).map(row => [row.id as string, row.username as string]));
  return rows.map(row => ({ ...row, profiles: names.has(String(row[idField])) ? { username: names.get(String(row[idField]))! } : null }));
}
