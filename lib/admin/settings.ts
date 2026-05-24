import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const SMART_PICKER_PUBLIC_KEY = "smart_picker_public_enabled";
const DAILY_CHECKIN_CREDITS_KEY = "daily_checkin_credits";

export const DEFAULT_DAILY_CHECKIN_CREDITS = 3;
export const MAX_DAILY_CHECKIN_CREDITS = 1000;

// Cached per server request: avoids re-querying when the same flag is checked
// by both the page guard and the API route in a single render pass.
export const isSmartPickerPublicEnabled = cache(async function isSmartPickerPublicEnabled(): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", SMART_PICKER_PUBLIC_KEY)
    .maybeSingle();
  return data?.value === true;
});

export async function setSmartPickerPublicEnabled(enabled: boolean, adminUserId: string): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");
  const { error } = await admin
    .from("app_settings")
    .upsert(
      {
        key: SMART_PICKER_PUBLIC_KEY,
        value: enabled,
        updated_at: new Date().toISOString(),
        updated_by: adminUserId
      },
      { onConflict: "key" }
    );
  if (error) throw error;
}

export const getDailyCheckinCredits = cache(async function getDailyCheckinCredits(): Promise<number> {
  const admin = createAdminClient();
  if (!admin) return DEFAULT_DAILY_CHECKIN_CREDITS;
  const { data } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", DAILY_CHECKIN_CREDITS_KEY)
    .maybeSingle();
  const raw = data?.value;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return DEFAULT_DAILY_CHECKIN_CREDITS;
  return Math.min(MAX_DAILY_CHECKIN_CREDITS, Math.floor(raw));
});

export async function setDailyCheckinCredits(credits: number, adminUserId: string): Promise<void> {
  if (!Number.isInteger(credits) || credits < 0 || credits > MAX_DAILY_CHECKIN_CREDITS) {
    throw new Error(`Credits must be an integer between 0 and ${MAX_DAILY_CHECKIN_CREDITS}.`);
  }
  const admin = createAdminClient();
  if (!admin) throw new Error("Service-role client unavailable");
  const { error } = await admin
    .from("app_settings")
    .upsert(
      {
        key: DAILY_CHECKIN_CREDITS_KEY,
        value: credits,
        updated_at: new Date().toISOString(),
        updated_by: adminUserId
      },
      { onConflict: "key" }
    );
  if (error) throw error;
}
