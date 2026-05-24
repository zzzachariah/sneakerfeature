// Bocha (博查) Web Search API client. Used by the recommend.ts tool-calling
// loop to fetch general-knowledge background (e.g. injury recovery principles)
// when the catalog alone doesn't cover the user's question.
//
// Endpoint:  POST https://api.bochaai.com/v1/web-search
// Auth:      Bearer ${BOCHA_API_KEY}
// Body:      { query, freshness, summary, count }
// Response:  { code: 200, data: { webPages: { value: [{ name, url, snippet, summary, siteName, datePublished }] } } }

export const BOCHA_API_KEY_NAME = "BOCHA_API_KEY";
const BOCHA_ENDPOINT = "https://api.bochaai.com/v1/web-search";
const DEFAULT_TIMEOUT_MS = 8000;
const MAX_SNIPPET_CHARS = 600;

export type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
  siteName: string | null;
  datePublished: string | null;
};

export type WebSearchResult =
  | { ok: true; query: string; results: WebSearchHit[] }
  | { ok: false; query: string; error: string };

export function isBochaConfigured(): boolean {
  return Boolean(process.env[BOCHA_API_KEY_NAME]?.trim());
}

function trimSnippet(text: unknown): string {
  if (typeof text !== "string") return "";
  const t = text.trim();
  if (t.length <= MAX_SNIPPET_CHARS) return t;
  return `${t.slice(0, MAX_SNIPPET_CHARS)}…`;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type BochaItem = {
  name?: unknown;
  url?: unknown;
  snippet?: unknown;
  summary?: unknown;
  siteName?: unknown;
  datePublished?: unknown;
};

export async function bochaWebSearch(
  query: string,
  opts?: { count?: number; freshness?: string; timeoutMs?: number; signal?: AbortSignal }
): Promise<WebSearchResult> {
  const apiKey = process.env[BOCHA_API_KEY_NAME]?.trim();
  if (!apiKey) return { ok: false, query, error: "missing_api_key" };

  const q = (query ?? "").trim();
  if (!q) return { ok: false, query: q, error: "empty_query" };

  const count = Math.max(1, Math.min(3, opts?.count ?? 3));
  const freshness = opts?.freshness ?? "noLimit";
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (opts?.signal) opts.signal.addEventListener("abort", onCallerAbort, { once: true });

  try {
    const res = await fetch(BOCHA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: q, freshness, summary: true, count }),
      signal: controller.signal
    });

    if (!res.ok) {
      console.warn("[web-search] http error", { query: q, status: res.status });
      return { ok: false, query: q, error: `HTTP ${res.status}` };
    }

    const body = (await res.json()) as { code?: number; msg?: string; data?: { webPages?: { value?: BochaItem[] } } };

    if (typeof body.code === "number" && body.code !== 200) {
      console.warn("[web-search] api error", { query: q, code: body.code });
      return { ok: false, query: q, error: `code ${body.code}` };
    }

    const items = body.data?.webPages?.value ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: false, query: q, error: "no_results" };
    }

    const results: WebSearchHit[] = items.slice(0, count).map((item) => ({
      title: pickString(item.name) ?? "(无标题)",
      url: pickString(item.url) ?? "",
      snippet: trimSnippet(item.summary ?? item.snippet),
      siteName: pickString(item.siteName),
      datePublished: pickString(item.datePublished)
    }));

    return { ok: true, query: q, results };
  } catch (error) {
    const reason = error instanceof Error ? (error.name === "AbortError" ? "timeout" : error.message.slice(0, 200)) : "unknown";
    console.warn("[web-search] failed", { query: q, reason });
    return { ok: false, query: q, error: reason };
  } finally {
    clearTimeout(timeoutId);
    if (opts?.signal) opts.signal.removeEventListener("abort", onCallerAbort);
  }
}
