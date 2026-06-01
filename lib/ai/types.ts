export type AiChatSummary = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type WebReference = {
  title: string;
  url: string;
};

export type RecommendationRaw = {
  shoe_id: string;
  stars: number;
  reason: string;
  pros: string[];
  cons: string[];
  // Web pages the AI consulted for this specific shoe (via web_search). Empty
  // or absent when no web research was done.
  references?: WebReference[];
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

// Live progress emitted by the recommend loop (server-side). Each variant maps
// 1:1 onto an SSE event whose name is `type` and whose payload is the object.
export type RecommendProgress =
  | { type: "status"; phase: "start" | "thinking" | "searching" | "finalizing"; message: string }
  | { type: "search"; query: string; state: "start" | "ok" | "fail"; resultCount?: number; kind?: string }
  | { type: "text"; delta: string };

export type OnProgress = (event: RecommendProgress) => void;

// SSE event names streamed from POST /api/ai/chat. `status`/`search`/`text`
// mirror RecommendProgress; `recommendations`/`done`/`error` are emitted by the
// route itself.
export type ChatSseEvent = RecommendProgress["type"] | "recommendations" | "done" | "error";

// A single rendered step in the live (streaming) assistant turn. EPHEMERAL —
// kept only in client state during streaming; never persisted to the DB and
// never returned by the messages GET route (reloaded turns show content + cards).
export type ChatStep =
  | { kind: "prose"; text: string }
  | { kind: "activity"; text: string; state?: "start" | "ok" | "fail" };

export type AiChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  recommendations: RecommendationItem[] | null;
  credits_charged: number;
  created_at: string;
  // Live-only timeline of what the AI said / did while streaming this turn.
  steps?: ChatStep[];
};

export const MAX_RECOMMENDATIONS = 10;
export const MAX_COMPARE = 5;
