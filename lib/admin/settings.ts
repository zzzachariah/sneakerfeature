import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const SMART_PICKER_PUBLIC_KEY = "smart_picker_public_enabled";

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
