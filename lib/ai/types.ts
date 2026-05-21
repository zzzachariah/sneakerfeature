export type AiChatSummary = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type RecommendationRaw = {
  shoe_id: string;
  stars: number;
  reason: string;
};

// Six-dimension radar point. Structurally compatible with the detail
// page's RadarAxis so it can be passed straight to PerformanceRadar.
export type RecRadarAxis = {
  label: string;
  rawText: string | null;
  score: number;
  tier: string;
};

export type RecTech = {
  forefoot: string | null;
  heel: string | null;
  outsole: string | null;
  upper: string | null;
};

export type RecommendationItem = RecommendationRaw & {
  slug: string;
  brand: string;
  shoe_name: string;
  image_url: string | null;
  category: string | null;
  // Derived from the catalog at enrich time (not persisted): drives the
  // inline radar on each card and the downloadable report.
  radar: RecRadarAxis[];
  tech: RecTech;
  playstyle: string | null;
};

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendations: RecommendationItem[] | null;
  credits_charged: number;
  created_at: string;
};

export const MAX_RECOMMENDATIONS = 10;
export const MAX_COMPARE = 5;
