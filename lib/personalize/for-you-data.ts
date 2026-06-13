import { createClient } from "@/lib/supabase/server";
import { getShoes } from "@/lib/data/shoes";
import { isValidPersona } from "@/lib/persona/types";
import type { Shoe } from "@/lib/types";
import type { ForYouShoe } from "@/components/personalize/for-you-view";

export type ForYouData = {
  signedIn: boolean;
  username: string;
  personaPosition: string | null;
  digest: { compare_shoes: unknown; recommendations: unknown } | null;
  recentShoes: ForYouShoe[];
  popular: ForYouShoe[];
};

function toForYouShoe(s: Shoe): ForYouShoe {
  return { id: s.id, name: s.shoe_name, slug: s.slug, image: s.image_url ?? null, brand: s.brand };
}

// Builds everything the For You face needs (greeting/persona, digest, recent
// views, popular). Used by both the home landing and the /for-you page. Pass an
// already-fetched shoes array to avoid a second getShoes() call.
export async function getForYouData(shoesInput?: Shoe[]): Promise<ForYouData> {
  const shoes = shoesInput ?? (await getShoes());

  const popular: ForYouShoe[] = [...shoes]
    .sort(
      (a, b) =>
        (b.userRatingCount ?? 0) - (a.userRatingCount ?? 0) ||
        (b.finalStars ?? 0) - (a.finalStars ?? 0)
    )
    .slice(0, 3)
    .map(toForYouShoe);

  const data: ForYouData = {
    signedIn: false,
    username: "",
    personaPosition: null,
    digest: null,
    recentShoes: [],
    popular
  };

  const supabase = await createClient();
  if (!supabase) return data;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  data.signedIn = Boolean(user);
  if (!user) return data;

  const [{ data: profile }, { data: dig }, { data: views }] = await Promise.all([
    supabase.from("profiles").select("username, persona").eq("id", user.id).maybeSingle(),
    supabase.from("weekly_digests").select("compare_shoes, recommendations").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("shoe_views")
      .select("shoe_id, last_viewed_at")
      .eq("user_id", user.id)
      .order("last_viewed_at", { ascending: false })
      .limit(30)
  ]);

  data.username = profile?.username ?? "";
  const persona = isValidPersona(profile?.persona) ? profile?.persona : null;
  data.personaPosition = persona?.positions?.[0] ?? null;
  data.digest = (dig as { compare_shoes: unknown; recommendations: unknown } | null) ?? null;

  const shoeById = new Map(shoes.map((s) => [s.id, s]));
  data.recentShoes = (views ?? [])
    .map((v) => shoeById.get(v.shoe_id))
    .filter((s): s is Shoe => Boolean(s))
    .map(toForYouShoe);

  return data;
}
