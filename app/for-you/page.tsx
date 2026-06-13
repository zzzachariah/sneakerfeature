import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { ForYouView, type ForYouShoe } from "@/components/personalize/for-you-view";
import { getShoes } from "@/lib/data/shoes";
import { isValidPersona } from "@/lib/persona/types";
import type { Shoe } from "@/lib/types";
import { absoluteUrl } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your weekly picks | sneakerfeature",
  description: "A weekly personalized set of shoe comparisons and recommendations based on what you browse.",
  alternates: { canonical: absoluteUrl("/for-you") },
  robots: { index: false, follow: false }
};

function toForYouShoe(s: Shoe): ForYouShoe {
  return { id: s.id, name: s.shoe_name, slug: s.slug, image: s.image_url ?? null, brand: s.brand };
}

export default async function ForYouPage() {
  const supabase = await createClient();
  const shoes = await getShoes();

  // Popular top 3 (most-rated, then highest scored) — always available, also
  // powers the signed-out "start browsing" state.
  const popular: ForYouShoe[] = [...shoes]
    .sort(
      (a, b) =>
        (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0) ||
        (b.finalStars ?? 0) - (a.finalStars ?? 0)
    )
    .slice(0, 3)
    .map(toForYouShoe);

  let signedIn = false;
  let username = "";
  let personaPosition: string | null = null;
  let digest: { compare_shoes: unknown; recommendations: unknown } | null = null;
  let recentShoes: ForYouShoe[] = [];

  if (supabase) {
    const {
      data: { user }
    } = await supabase.auth.getUser();
    signedIn = Boolean(user);

    if (user) {
      const [{ data: profile }, { data: dig }, { data: views }] = await Promise.all([
        supabase.from("profiles").select("username, persona").eq("id", user.id).maybeSingle(),
        supabase.from("weekly_digests").select("compare_shoes, recommendations").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("shoe_views")
          .select("shoe_id, last_viewed_at")
          .eq("user_id", user.id)
          .order("last_viewed_at", { ascending: false })
          .limit(12)
      ]);

      username = profile?.username ?? "";
      const persona = isValidPersona(profile?.persona) ? profile?.persona : null;
      personaPosition = persona?.positions?.[0] ?? null;
      digest = (dig as { compare_shoes: unknown; recommendations: unknown } | null) ?? null;

      const shoeById = new Map(shoes.map((s) => [s.id, s]));
      recentShoes = (views ?? [])
        .map((v) => shoeById.get(v.shoe_id))
        .filter((s): s is Shoe => Boolean(s))
        .map(toForYouShoe);
    }
  }

  return (
    <ForYouView
      signedIn={signedIn}
      username={username}
      personaPosition={personaPosition}
      digest={digest}
      recentShoes={recentShoes}
      popular={popular}
    />
  );
}
