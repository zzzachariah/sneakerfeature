import type { SupabaseClient } from "@supabase/supabase-js";
import { PENDING_CORRECTIONS_BUCKET, PUBLIC_IMAGES_BUCKET } from "@/lib/images/sanitize-upload";

const PAYMENT_SCREENSHOTS_BUCKET = "payment-screenshots";

async function removeAll(db: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db.storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) console.error(`[purge-user-files] ${bucket} remove failed`, error.message);
  }
}

/**
 * Delete the personal files a user uploaded, before their account row goes.
 * Database rows cascade on their own; storage objects do not.
 *
 * Kept on purpose: image corrections an admin APPROVED, which are now the
 * public catalogue photo for a shoe rather than personal data.
 */
export async function purgeUserFiles(db: SupabaseClient, userId: string): Promise<void> {
  const { data: corrections } = await db
    .from("image_corrections")
    .select("storage_bucket, storage_path, status")
    .eq("user_id", userId)
    .neq("status", "approved");
  const privatePaths: string[] = [];
  const legacyPublicPaths: string[] = [];
  for (const row of corrections ?? []) {
    if (!row.storage_path) continue;
    if (row.storage_bucket === PENDING_CORRECTIONS_BUCKET) privatePaths.push(row.storage_path);
    else legacyPublicPaths.push(row.storage_path);
  }
  await removeAll(db, PENDING_CORRECTIONS_BUCKET, privatePaths);
  await removeAll(db, PUBLIC_IMAGES_BUCKET, legacyPublicPaths);

  // Manual-payment screenshots: referenced by orders and stored under <userId>/.
  const { data: orders } = await db
    .from("ai_payment_orders")
    .select("id, screenshot_path")
    .eq("user_id", userId)
    .not("screenshot_path", "is", null);
  const screenshotPaths = new Set((orders ?? []).map((o) => o.screenshot_path as string));
  const { data: listed } = await db.storage.from(PAYMENT_SCREENSHOTS_BUCKET).list(userId, { limit: 1000 });
  for (const obj of listed ?? []) screenshotPaths.add(`${userId}/${obj.name}`);
  await removeAll(db, PAYMENT_SCREENSHOTS_BUCKET, [...screenshotPaths]);
  if (orders?.length) {
    await db.from("ai_payment_orders").update({ screenshot_path: null }).eq("user_id", userId);
  }
}
