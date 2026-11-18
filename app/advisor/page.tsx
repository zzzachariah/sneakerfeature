import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "AI Advisor | sneakerfeature",
  robots: { index: false, follow: false }
};

// Keep old bookmarks and shoe-page links working in the unified picker. The
// destination handles sign-in and shows the Chat entitlement before any send.
export default async function AdvisorPage({
  searchParams
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const { ask } = await searchParams;
  const query = new URLSearchParams({ mode: "chat" });
  if (typeof ask === "string") query.set("ask", ask.slice(0, 400));
  redirect(`/smart-picker?${query.toString()}`);
}
