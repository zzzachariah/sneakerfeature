import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ForYouView } from "@/components/personalize/for-you-view";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your weekly picks | sneakerfeature",
  description: "A weekly personalized set of shoe comparisons and recommendations based on what you browse.",
  alternates: { canonical: absoluteUrl("/for-you") },
  robots: { index: false, follow: false }
};

export default async function ForYouPage() {
  const supabase = await createClient();

  let digest = null;
  let signedIn = false;

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);
    if (user) {
      const { data } = await supabase
        .from("weekly_digests")
        .select("compare_shoes, recommendations")
        .eq("user_id", user.id)
        .maybeSingle();
      digest = data ?? null;
    }
  }

  return <ForYouView digest={digest} signedIn={signedIn} />;
}
