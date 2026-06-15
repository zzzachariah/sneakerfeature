import type { Metadata } from "next";
import { ForYouView } from "@/components/personalize/for-you-view";
import { getForYouData } from "@/lib/personalize/for-you-data";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your weekly picks | sneakerfeature",
  description: "A weekly personalized set of shoe comparisons and recommendations based on what you browse.",
  alternates: { canonical: absoluteUrl("/for-you") },
  robots: { index: false, follow: false }
};

export default async function ForYouPage() {
  const data = await getForYouData();
  return (
    <main className="has-mobile-nav-pad">
      <ForYouView {...data} />
    </main>
  );
}
