export type UserRole = "user" | "admin";

export interface ShoeSpec {
  forefoot_midsole_tech?: string | null;
  heel_midsole_tech?: string | null;
  outsole_tech?: string | null;
  upper_tech?: string | null;
  cushioning_feel?: string | null;
  court_feel?: string | null;
  bounce?: string | null;
  stability?: string | null;
  traction?: string | null;
  fit?: string | null;
  containment?: string | null;
  support?: string | null;
  torsional_rigidity?: string | null;
  playstyle_summary?: string | null;
  story_summary?: string | null;
  tags?: string[];
}

export interface Shoe {
  id: string;
  slug: string;
  brand: string;
  shoe_name: string;
  model_line?: string | null;
  version_name?: string | null;
  release_year?: number | null;
  category?: string | null;
  player?: string | null;
  price?: number | null;
  weight?: string | null;
  image_url?: string | null;
  spec: ShoeSpec;
  story?: {
    title?: string | null;
    content?: string | null;
    source_label?: string | null;
    source_url?: string | null;
  } | null;
  userRatingCount?: number;
  specStars?: number | null;
  finalStars?: number | null;
  dimStars?: Partial<Record<
    "cushioning_feel" | "court_feel" | "bounce" | "stability" | "traction" | "fit",
    number
  >> | null;
  myDimRatings?: Partial<Record<
    "cushioning_feel" | "court_feel" | "bounce" | "stability" | "traction" | "fit",
    number
  >> | null;
}

export interface ShoeImageRecord {
  id: string;
  shoe_id: string;
  storage_path: string;
  public_url: string;
  status: "pending" | "approved" | "rejected";
  provider: string;
  provider_model?: string | null;
  search_provider?: string | null;
  search_model?: string | null;
  search_used?: boolean;
  source_image_url?: string | null;
  source_domain?: string | null;
  source_type?: "official" | "retailer" | "review_media" | "unknown" | null;
  selection_reason?: string | null;
  prompt?: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason?: string | null;
  generation_error?: string | null;
}

// A sneaker-blogger video review shown as a "博主点评" card on the detail page's
// comments slide. Content (pros/cons/summary) is AI-paraphrased from the video
// transcript and stored in Chinese; the UI translates it at render time.
// The public band only ever reads blogger_name/platform/video_url/pros/cons/
// summary/source_label — transcript/status/error_detail are admin-only fields.
export interface BloggerReview {
  id: string;
  shoe_id: string;
  blogger_name: string;
  platform: "youtube" | "bilibili";
  video_url: string;
  pros: string[];
  cons: string[];
  summary: string | null;
  // English versions (populated at summarize time) so the English UI never has
  // to translate Chinese at render — it just reads these instead.
  pros_en?: string[];
  cons_en?: string[];
  summary_en?: string | null;
  source_label?: string | null;
  status?: "pending" | "ready" | "error";
  error_detail?: string | null;
  is_published?: boolean;
  transcript?: string | null;
  created_at?: string;
  updated_at?: string;
}
