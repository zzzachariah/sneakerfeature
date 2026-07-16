import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ShoeFit } from "@/lib/foot-scan/fit-advisor";
import type { FootProfile } from "@/lib/foot-scan/types";
import { isFootProfile } from "@/lib/foot-scan/types";

const FIT_COLUMNS = "length_bias, adjust_half_sizes, width_fit, volume, notes, notes_zh, confidence, source";

// Per-shoe fit row (public-read). Returns null when the shoe has no fit data yet
// (the advisor falls back to a labelled brand-level estimate).
export async function getShoeFit(shoeId: string): Promise<ShoeFit | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase.from("shoe_fit").select(FIT_COLUMNS).eq("shoe_id", shoeId).maybeSingle();
    return (data as ShoeFit | null) ?? null;
  } catch {
    // Table not migrated yet — degrade gracefully.
    return null;
  }
}

// The signed-in member's saved foot profile (from the foot scan), used to
// personalize the size advice. Tolerant of the column not existing yet.
export async function getFootProfile(userId: string): Promise<FootProfile | null> {
  const db = createAdminClient();
  if (!db) return null;
  try {
    const { data } = await db.from("profiles").select("foot_profile").eq("id", userId).maybeSingle();
    if (data && isFootProfile(data.foot_profile)) return data.foot_profile;
  } catch {
    /* column absent — ignore */
  }
  return null;
}

// Admin upsert of a shoe's fit row.
export async function upsertShoeFit(
  shoeId: string,
  fit: Omit<ShoeFit, "source"> & { source?: ShoeFit["source"] },
  adminId: string
): Promise<void> {
  const db = createAdminClient();
  if (!db) throw new Error("Service-role client unavailable");
  const { error } = await db.from("shoe_fit").upsert({
    shoe_id: shoeId,
    length_bias: fit.length_bias,
    adjust_half_sizes: fit.adjust_half_sizes,
    width_fit: fit.width_fit,
    volume: fit.volume,
    notes: fit.notes,
    notes_zh: fit.notes_zh,
    confidence: fit.confidence,
    source: fit.source ?? "admin",
    updated_by: adminId,
    updated_at: new Date().toISOString()
  });
  if (error) throw error;
}
