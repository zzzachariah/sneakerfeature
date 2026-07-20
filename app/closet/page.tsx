import type { Metadata } from "next";
import type { Shoe } from "@/lib/types";
import { getShoes } from "@/lib/data/shoes";
import { getCurrentUser } from "@/lib/data/auth";
import { createClient } from "@/lib/supabase/server";
import { ClosetView, type ClosetEntry, type PickerShoe } from "@/components/closet/closet-view";
import type { ClosetItemRow } from "@/lib/closet/wear";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My closet | sneakerfeature",
  robots: { index: false, follow: false }
};

export default async function ClosetPage() {
  const [user, supabase] = await Promise.all([getCurrentUser(), createClient()]);
  let entries: ClosetEntry[] = [];
  let picker: PickerShoe[] = [];

  try {
    const allShoes = await getShoes();
    const byId = new Map(allShoes.map((s) => [s.id, s]));
    picker = allShoes.map((s) => ({
      id: s.id,
      brand: s.brand,
      shoe_name: s.shoe_name,
      image_url: s.image_url ?? null
    }));

    if (user && supabase) {
      const { data } = await supabase
        .from("shoe_closet")
        .select("shoe_id, size_label, purchase_price, purchased_at, play_hours, sessions, retired, retired_at, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      entries = ((data ?? []) as ClosetItemRow[])
        .map((item) => {
          const shoe = byId.get(item.shoe_id);
          return shoe ? { item, shoe } : null;
        })
        .filter((e): e is { item: ClosetItemRow; shoe: Shoe } => e !== null);
    }
  } catch {
    // Table missing (migration not yet applied) or DB unavailable — show empty.
  }

  return <ClosetView initialEntries={entries} picker={picker} signedIn={Boolean(user)} />;
}
