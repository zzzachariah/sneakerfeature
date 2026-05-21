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

export type RecommendationItem = RecommendationRaw & {
  slug: string;
  brand: string;
  shoe_name: string;
  image_url: string | null;
  category: string | null;
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
