import { cache } from "react";
import { getCurrentProfile } from "@/lib/data/auth";
import { isSmartPickerPublicEnabled } from "@/lib/admin/settings";

export type SmartPickerContext = {
  userId: string;
  username: string | null;
  isAdmin: boolean;
};

// Returns context if the current user can use Smart Picker:
//   - Admins always pass.
//   - Non-admins pass only when the `smart_picker_public_enabled` flag is on.
// Returns null in every other case (no session, not allowed).
export const getSmartPickerContext = cache(async function getSmartPickerContext(): Promise<SmartPickerContext | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (profile.role === "admin") {
    return { userId: profile.id, username: profile.username, isAdmin: true };
  }
  const enabled = await isSmartPickerPublicEnabled();
  if (!enabled) return null;
  return { userId: profile.id, username: profile.username, isAdmin: false };
});
