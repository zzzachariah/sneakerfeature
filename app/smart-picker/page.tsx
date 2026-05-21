import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/auth";
import { SmartPickerClient } from "@/components/smart-picker/smart-picker-client";
import { UnderDevelopment } from "@/components/smart-picker/under-development";

export const metadata: Metadata = {
  title: "Smart Picker | SNKR Feature",
  robots: { index: false, follow: false }
};

export default async function SmartPickerPage() {
  const profile = await getCurrentProfile();

  // Trial gate: only admins get the real feature; everyone else (all logged-in
  // non-admins; anonymous users are bounced to /login by middleware) sees the
  // "under development" placeholder.
  if (!profile || profile.role !== "admin") {
    return <UnderDevelopment />;
  }

  return <SmartPickerClient />;
}
