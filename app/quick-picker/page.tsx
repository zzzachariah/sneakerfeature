import type { Metadata } from "next";
import { getShoes } from "@/lib/data/shoes";
import { QuickPickerClient } from "@/components/quick-picker/quick-picker-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Quick Picker — sneakerfeature",
  description: "Answer three quick questions and get basketball shoes matched to your game — no account needed."
};

export default async function QuickPickerPage() {
  const shoes = await getShoes();
  return <QuickPickerClient shoes={shoes} />;
}
