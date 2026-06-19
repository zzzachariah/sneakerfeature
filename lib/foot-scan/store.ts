// Persistence for foot scans + the kept foot profile. Uses the service-role
// client (the API routes have already authenticated + authorised the user via
// getFootScanContext), mirroring how the AI chat routes write.

import { createAdminClient } from "@/lib/supabase/admin";
import type { FootProfile, FootScanResult } from "@/lib/foot-scan/types";

export type StoredScan = {
  id: string;
  created_at: string;
  result: FootScanResult;
};

// Append a completed scan to history. Returns the new row id (or null if the DB
// is unavailable — the result is still shown to the user either way).
export async function saveScan(userId: string, result: FootScanResult): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("foot_scans")
    .insert({ user_id: userId, result })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[foot-scan] saveScan error", error);
    return null;
  }
  return data?.id ?? null;
}

export async function listScans(userId: string, limit = 10): Promise<StoredScan[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("foot_scans")
    .select("id, created_at, result")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[foot-scan] listScans error", error);
    return [];
  }
  return (data ?? []) as StoredScan[];
}

// Load a single scan, scoped to its owner.
export async function getScan(userId: string, scanId: string): Promise<StoredScan | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin
    .from("foot_scans")
    .select("id, created_at, result")
    .eq("id", scanId)
    .eq("user_id", userId)
    .maybeSingle();
  return data ? (data as StoredScan) : null;
}

// Derive the compact, persisted profile from a full result (uses the primary
// foot's traits).
export function buildFootProfile(result: FootScanResult, scannedAt: string): FootProfile {
  return {
    foot_width: result.primary.traits.width,
    instep: result.primary.traits.instep,
    toe_shape: result.primary.traits.toe_shape,
    hallux: result.primary.traits.hallux,
    foot_length_mm: result.primary.measurements.foot_length_mm,
    foot_width_mm: result.primary.measurements.foot_width_mm,
    scanned_at: scannedAt
  };
}

export async function saveFootProfile(userId: string, profile: FootProfile): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { error } = await admin.from("profiles").update({ foot_profile: profile }).eq("id", userId);
  if (error) {
    console.error("[foot-scan] saveFootProfile error", error);
    return false;
  }
  return true;
}

export async function getFootProfile(userId: string): Promise<FootProfile | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("profiles").select("foot_profile").eq("id", userId).maybeSingle();
  const raw = data?.foot_profile;
  return raw ? (raw as FootProfile) : null;
}
