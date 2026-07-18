import type { Metadata } from "next";
import { getSmartPickerContext } from "@/lib/ai/access";
import { SmartPickerClient } from "@/components/smart-picker/smart-picker-client";
import { SmartPickerSignedOut } from "@/components/smart-picker/signed-out";

export const metadata: Metadata = {
  title: "Smart Picker | sneakerfeature",
  robots: { index: false, follow: false }
};

export default async function SmartPickerPage({
  searchParams
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  // Open to any signed-in user (see getSmartPickerContext). Signed-out visitors
  // get a sign-in prompt with a link to the free Quick Picker.
  const ctx = await getSmartPickerContext();
  if (!ctx) return <SmartPickerSignedOut />;
  // ?ask= pre-fills the composer (e.g. the Max concierge entry from a shoe page).
  const { ask } = await searchParams;
  const initialPrompt = typeof ask === "string" ? ask.slice(0, 400) : undefined;
  return <SmartPickerClient initialPrompt={initialPrompt} />;
}
