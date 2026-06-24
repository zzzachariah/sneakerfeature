import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Record that a viewer saw a specific announcement. Idempotent per (viewer,
 * announcement): re-calls from the same viewer are silently ignored thanks
 * to the partial-unique indexes in migration 036.
 *
 * Callers should pass either `userId` (preferred when the visitor is logged
 * in) or `clientId` (an anon uuid in localStorage), or both — both is fine,
 * we'll write only the dedupable identifier(s) that are present.
 */
export async function recordAnnouncementView({
  announcementId,
  userId,
  clientId,
}: {
  announcementId: string;
  userId?: string | null;
  clientId?: string | null;
}): Promise<void> {
  if (!announcementId) return;
  if (!userId && !clientId) return;
  const admin = createAdminClient();
  if (!admin) return;
  // Insert. Postgres unique-violation (code 23505) is the expected idempotent
  // path; everything else is a real error worth surfacing.
  const { error } = await admin.from("announcement_views").insert({
    announcement_id: announcementId,
    user_id: userId ?? null,
    client_id: userId ? null : clientId ?? null,
  });
  if (error && error.code !== "23505") {
    console.error("[announcement_views] insert failed", error);
  }
}

/** Count unique reads for one announcement. */
export async function countViewsFor(announcementId: string): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return 0;
  const { count, error } = await admin
    .from("announcement_views")
    .select("id", { count: "exact", head: true })
    .eq("announcement_id", announcementId);
  if (error) return 0;
  return count ?? 0;
}

/** Count unique reads for many announcements at once. Returns a map keyed
 *  by announcement_id; missing keys mean zero. One round-trip regardless
 *  of how many ids are passed. */
export async function countViewsForMany(ids: string[]): Promise<Record<string, number>> {
  if (ids.length === 0) return {};
  const admin = createAdminClient();
  if (!admin) return {};
  const { data, error } = await admin
    .from("announcement_views")
    .select("announcement_id")
    .in("announcement_id", ids);
  if (error || !Array.isArray(data)) return {};
  const counts: Record<string, number> = {};
  for (const row of data as { announcement_id: string }[]) {
    counts[row.announcement_id] = (counts[row.announcement_id] ?? 0) + 1;
  }
  return counts;
}
