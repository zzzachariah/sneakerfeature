import type { Metadata } from "next";
import { getSmartPickerContext } from "@/lib/ai/access";
import { SmartPickerClient } from "@/components/smart-picker/smart-picker-client";
import { SmartPickerSignedOut } from "@/components/smart-picker/signed-out";

export const metadata: Metadata = {
  title: "Smart Picker | sneakerfeature",
  robots: { index: false, follow: false }
};

export default async function SmartPickerPage() {
  // Open to any signed-in user (see getSmartPickerContext). Signed-out visitors
  // get a sign-in prompt with a link to the free Quick Picker.
  const ctx = await getSmartPickerContext();
  if (!ctx) return <SmartPickerSignedOut />;
  return <SmartPickerClient />;
}
