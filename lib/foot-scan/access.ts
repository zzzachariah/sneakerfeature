import { cache } from "react";
import { getCurrentProfile } from "@/lib/data/auth";
import { isFootScanPublicEnabled } from "@/lib/admin/settings";

export type FootScanContext = {
  userId: string;
  username: string | null;
  isAdmin: boolean;
};

// Mirrors getSmartPickerContext: the Foot Scan tool is hidden from the homepage
// and gated here.
//   - Admins always pass (R&D access).
//   - Non-admins pass only when `foot_scan_public_enabled` is on.
//   - Everyone else (and logged-out) gets null → the "under development" page.
export const getFootScanContext = cache(async function getFootScanContext(): Promise<FootScanContext | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  if (profile.role === "admin") {
    return { userId: profile.id, username: profile.username, isAdmin: true };
  }
  const enabled = await isFootScanPublicEnabled();
  if (!enabled) return null;
  return { userId: profile.id, username: profile.username, isAdmin: false };
});
