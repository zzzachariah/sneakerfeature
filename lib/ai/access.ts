import { cache } from "react";
import { getCurrentProfile } from "@/lib/data/auth";

export type SmartPickerContext = {
  userId: string;
  username: string | null;
  isAdmin: boolean;
};

// Smart Picker is open to any signed-in user — chats and credits are per-user,
// and the credits system bounds AI usage. Admins are always allowed. Signed-out
// visitors get null, and the page/API prompt them to log in.
export const getSmartPickerContext = cache(async function getSmartPickerContext(): Promise<SmartPickerContext | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  return { userId: profile.id, username: profile.username, isAdmin: profile.role === "admin" };
});
