import type { Metadata } from "next";
import { getSmartPickerContext } from "@/lib/ai/access";
import { SmartPickerClient } from "@/components/smart-picker/smart-picker-client";
import { UnderDevelopment } from "@/components/smart-picker/under-development";

export const metadata: Metadata = {
  title: "Smart Picker | sneakerfeature",
  robots: { index: false, follow: false }
};

export default async function SmartPickerPage() {
  // Access is granted when:
  //   - the viewer is an admin (always), OR
  //   - the `smart_picker_public_enabled` flag is on (admin-controlled in
  //     /admin overview). Otherwise non-admins see the placeholder.
  const ctx = await getSmartPickerContext();
  if (!ctx) return <UnderDevelopment />;
  return <SmartPickerClient />;
}
