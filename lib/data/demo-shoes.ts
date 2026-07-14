import { Shoe } from "@/lib/types";

export const demoShoes: Shoe[] = [
  {
    id: "11111111-1111-1111-1111-111111111111",
    slug: "nike-kobe-6-protro",
    brand: "Nike",
    shoe_name: "Kobe 6 Protro",
    model_line: "Kobe",
    version_name: "Protro",
    release_year: 2020,
    category: "Guard",
    player: "Kobe Bryant",
    price: 190,
    weight: "13.2 oz",
    spec: {
      forefoot_midsole_tech: "Zoom Turbo",
      heel_midsole_tech: "Cushlon",
      outsole_tech: "Micro herringbone",
      upper_tech: "Engineered mesh + TPU scales",
      cushioning_feel: "Responsive",
      court_feel: "Excellent",
      bounce: "High",
      stability: "High",
      traction: "Elite",
      fit: "Snug",
      playstyle_summary: "Explosive guard shoe with elite traction and court feel.",
      story_summary: "A modernized performance retro honoring Kobe's low-top lineage.",
      tags: ["guard", "low-top", "responsive"]
    }
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    slug: "adidas-ae-1",
    brand: "adidas",
    shoe_name: "AE 1",
    model_line: "Anthony Edwards",
    release_year: 2024,
    category: "Wing",
    player: "Anthony Edwards",
    price: 120,
    weight: "15.6 oz",
    spec: {
      forefoot_midsole_tech: "Lightstrike",
      heel_midsole_tech: "Boost carrier",
      outsole_tech: "Radial herringbone",
      upper_tech: "Generative support wing",
      cushioning_feel: "Balanced",
      court_feel: "Good",
      bounce: "Medium",
      stability: "High",
      traction: "Great",
      fit: "True to size",
      playstyle_summary: "Power guard profile with containment and confidence cuts.",
      story_summary: "Debut signature built around Edwards' physical style.",
      tags: ["wing", "support", "signature"]
    }
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    slug: "anta-kai-1",
    brand: "Anta",
    shoe_name: "KAI 1",
    release_year: 2024,
    category: "Guard",
    player: "Kyrie Irving",
    price: 125,
    weight: "14.1 oz",
    spec: {
      forefoot_midsole_tech: "Nitroedge",
      heel_midsole_tech: "Nitroedge",
      outsole_tech: "Multi-zone herringbone",
      upper_tech: "Woven textile",
      cushioning_feel: "Plush-responsive",
      court_feel: "Very good",
      traction: "Excellent",
      stability: "Great",
      fit: "One-to-one",
      playstyle_summary: "Quick guard setup with strong stop-start bite.",
      story_summary: "First Kyrie model with Anta emphasizing artistry and grip.",
      tags: ["guard", "traction"]
    }
  }
];

// Sentinel ids of the built-in demo catalog, served only when the live catalog
// can't be loaded (Supabase down / transient error / empty).
const DEMO_SHOE_IDS = new Set(demoShoes.map((s) => s.id));

// True when a shoe list is exactly the built-in demo fallback. The client uses
// this to recognize that the SSR list is a placeholder — so it prefers the
// on-device (IndexedDB) catalog or a live /api/shoes refresh instead of locking
// onto these 3 demo shoes. Requires an exact id match, so a real 3-shoe catalog
// (with real UUIDs) is never mistaken for the demo set.
export function isDemoCatalog(shoes: Pick<Shoe, "id">[]): boolean {
  return shoes.length === DEMO_SHOE_IDS.size && shoes.every((s) => DEMO_SHOE_IDS.has(s.id));
}
