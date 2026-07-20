import type { Metadata } from "next";
import { getCurrentProfile } from "@/lib/data/auth";
import { getMemberContext } from "@/lib/subscription/entitlements";
import { AdvisorClient } from "@/components/advisor/advisor-client";
import { AdvisorLocked } from "@/components/advisor/advisor-locked";

export const metadata: Metadata = {
  title: "AI Advisor | sneakerfeature",
  robots: { index: false, follow: false }
};

// The advisor is a Max flagship. Signed-out visitors and Pro/free members get
// the locked upsell; Max members (and admins) get the live chat. ?ask= (e.g. the
// concierge entry from a shoe page) pre-fills the composer without auto-sending.
export default async function AdvisorPage({
  searchParams
}: {
  searchParams: Promise<{ ask?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) return <AdvisorLocked reason="signed-out" />;

  const isAdmin = profile.role === "admin";
  const member = await getMemberContext(profile.id);
  const tier = isAdmin ? "max" : member.tier;
  if (tier !== "max") return <AdvisorLocked reason="tier" tier={member.tier} />;

  const { ask } = await searchParams;
  const initialPrompt = typeof ask === "string" ? ask.slice(0, 400) : undefined;
  return <AdvisorClient initialPrompt={initialPrompt} />;
}
