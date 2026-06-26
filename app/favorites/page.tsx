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
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  let shoes: Shoe[] = [];

  if (user && supabase) {
    let ids = new Set<string>();
    try {
      const [{ data }, allShoes] = await Promise.all([
        supabase.from("favorites").select("shoe_id").eq("user_id", user.id),
        getShoes()
      ]);
      ids = new Set((data ?? []).map((r) => r.shoe_id as string));
      shoes = allShoes.filter((s) => ids.has(s.id));
    } catch {
      // Table missing (migration not yet applied) or DB unavailable — show empty.
    }
  }

  return <FavoritesView shoes={shoes} signedIn={Boolean(user)} />;
}
