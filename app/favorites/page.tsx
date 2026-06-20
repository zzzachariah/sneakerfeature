import type { Metadata } from "next";
import type { Shoe } from "@/lib/types";
import { getShoes } from "@/lib/data/shoes";
import { getCurrentUser } from "@/lib/data/auth";
import { createClient } from "@/lib/supabase/server";
import { FavoritesView } from "@/components/favorites/favorites-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Saved shoes | sneakerfeature",
  robots: { index: false, follow: false }
};

export default async function FavoritesPage() {
  const user = await getCurrentUser();
  let shoes: Shoe[] = [];

  if (user) {
    let ids = new Set<string>();
    try {
      const supabase = await createClient();
      if (supabase) {
        const { data } = await supabase.from("favorites").select("shoe_id").eq("user_id", user.id);
        ids = new Set((data ?? []).map((r) => r.shoe_id as string));
      }
    } catch {
      // Table missing (migration not yet applied) or DB unavailable — show empty.
    }
    if (ids.size > 0) {
      shoes = (await getShoes()).filter((s) => ids.has(s.id));
    }
  }

  return <FavoritesView shoes={shoes} signedIn={Boolean(user)} />;
}
