// Server-side web search for recommendation evidence. Tavily uses basic search
// (one credit) with optional paid enrichment disabled. Bocha remains available
// for existing deployments; errors never silently switch to another provider.

export const BOCHA_API_KEY_NAME = "BOCHA_API_KEY";
export const TAVILY_API_KEY_NAME = "TAVILY_API_KEY";
export function getWebSearchProvider(): "tavily" | "bocha" {
  const selected = process.env.WEB_SEARCH_PROVIDER?.trim();
  if (selected === "bocha") return "bocha";
  if (selected === "tavily" || process.env.TAVILY_API_KEY?.trim()) return "tavily";
  return "bocha";
}
function keyName() {
  return getWebSearchProvider() === "tavily" ? TAVILY_API_KEY_NAME : BOCHA_API_KEY_NAME;
}
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

// Tagged error categories so callers/operators can tell "wrong key" from "no
// results" from "timeout" at a glance. `detail` holds the upstream `msg` /
// status / error string for diagnostics.
export type WebSearchErrorKind =
  | "missing_api_key"
  | "empty_query"
  | "auth"          // HTTP 401 / 403 — bad or revoked key
  | "quota_exceeded" // Credits exhausted: do not retry or silently use paid fallback
  | "rate_limited"  // HTTP 429
  | "upstream"      // HTTP 5xx / non-200 `code`
  | "network"       // fetch threw (DNS, refused, etc.)
  | "timeout"
  | "parse"
  | "no_results"
  | "unknown";

export type WebSearchResult =
  | { ok: true; query: string; results: WebSearchHit[] }
  | { ok: false; query: string; error: WebSearchErrorKind; detail: string };

export function isWebSearchConfigured(): boolean {
  return Boolean(process.env[keyName()]?.trim());
}

// Human-readable Chinese explanation for a search error — used in server logs
// and admin-facing diagnostic strings. Mirrors describePackyError shape.
export function describeWebSearchError(kind: WebSearchErrorKind, detail?: string): string {
  const provider = getWebSearchProvider() === "tavily" ? "Tavily" : "Bocha";
  const tail = detail ? `（${detail}）` : "";
  switch (kind) {
    case "missing_api_key":
      return `${provider} 未配置：环境变量 ${keyName()} 缺失或为空${tail}`;
    case "empty_query":
      return `${provider} 调用时 query 为空${tail}`;
    case "auth":
      return `${provider} 鉴权失败，请检查 ${keyName()} 是否正确、是否已激活${tail}`;
    case "quota_exceeded":
      return `${provider} 搜索额度已用完，请检查套餐额度${tail}`;
    case "rate_limited":
      return `${provider} 触发限流，稍后重试${tail}`;
    case "upstream":
      return `${provider} 服务端错误${tail}`;
    case "network":
      return `${provider} 网络异常${tail}`;
    case "timeout":
      return `${provider} 请求超时${tail}`;
    case "parse":
      return `${provider} 返回内容解析失败${tail}`;
    case "no_results":
      return `${provider} 未返回任何结果${tail}`;
    default:
      return `${provider} 未知错误${tail}`;
  }
}

function categorizeHttpStatus(status: number): WebSearchErrorKind {
  if ([402, 432, 433].includes(status)) return "quota_exceeded";
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "upstream";
  return "upstream"; // 4xx other than auth/429 — still an upstream protocol error
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

export async function webSearch(
  query: string,
  opts?: { count?: number; freshness?: string; timeoutMs?: number; signal?: AbortSignal }
): Promise<WebSearchResult> {
  const provider = getWebSearchProvider();
  const apiKey = process.env[keyName()]?.trim();
  if (!apiKey) {
    console.warn("[web-search] missing_api_key", { hint: `set env ${keyName()}` });
    return { ok: false, query, error: "missing_api_key", detail: keyName() };
  }

  const q = (query ?? "").trim();
  if (!q) return { ok: false, query: q, error: "empty_query", detail: "" };

  const count = Math.max(1, Math.min(3, opts?.count ?? 3));
  const freshness = opts?.freshness ?? "noLimit";
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const onCallerAbort = () => controller.abort();
  if (opts?.signal?.aborted) controller.abort();
  else opts?.signal?.addEventListener("abort", onCallerAbort, { once: true });

  try {
    const res = await fetch(provider === "tavily" ? "https://api.tavily.com/search" : BOCHA_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(provider === "tavily" ? {
        query: q, topic: "general", search_depth: "basic", auto_parameters: false,
        max_results: count, include_answer: false, include_raw_content: false,
        include_images: false, include_usage: true,
        language: /[\u3400-\u9fff]/.test(q) ? "zh-cn" : "en"
      } : { query: q, freshness, summary: true, count }),
      signal: controller.signal
    });

    if (!res.ok) {
      // Best-effort read upstream body for the operator log — Bocha returns
      // `{ code, msg }` shape on errors too. Truncate so a giant HTML error
      // page can't blow up logs.
      const rawMsg = (await res.text().catch(() => "")).replaceAll(apiKey, "[redacted]").slice(0, 300);
      const kind = /not have enough money|quota|usage limit|credit.*exhaust/i.test(rawMsg)
        ? "quota_exceeded" : categorizeHttpStatus(res.status);
      const detail = `HTTP ${res.status}${rawMsg ? ` — ${rawMsg}` : ""}`;
      console.warn("[web-search] http error", { provider, query: q, status: res.status, kind, msg: rawMsg.slice(0, 120) });
      return { ok: false, query: q, error: kind, detail };
    }

    let body: { code?: number; msg?: string; data?: { webPages?: { value?: BochaItem[] } }; results?: { title?: unknown; url?: unknown; content?: unknown; published_date?: unknown }[]; usage?: { credits?: number } };
    try {
      body = await res.json();
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected a search response object");
    } catch (parseErr) {
      const detail = parseErr instanceof Error ? parseErr.message.replaceAll(apiKey, "[redacted]").slice(0, 200) : "non-JSON response";
      console.warn("[web-search] parse error", { query: q, detail });
      return { ok: false, query: q, error: "parse", detail };
    }

    if (typeof body.code === "number" && body.code !== 200) {
      const upstreamMsg = (body.msg ?? "").replaceAll(apiKey, "[redacted]").slice(0, 300);
      // Bocha sometimes signals auth via `code` instead of HTTP status.
      const kind: WebSearchErrorKind =
        body.code === 401 || body.code === 403
          ? "auth"
          : body.code === 429
            ? "rate_limited"
            : "upstream";
      const detail = `code ${body.code}${upstreamMsg ? ` — ${upstreamMsg}` : ""}`;
      console.warn("[web-search] api error", { query: q, code: body.code, kind, msg: upstreamMsg.slice(0, 120) });
      return { ok: false, query: q, error: kind, detail };
    }

    const items: BochaItem[] = provider === "tavily"
      ? (Array.isArray(body.results) ? body.results.filter((item) => item && typeof item === "object").map((item) => ({
          name: item.title, url: item.url, snippet: item.content, datePublished: item.published_date
        })) : [])
      : body.data?.webPages?.value ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      console.warn("[web-search] no_results", { query: q });
      return { ok: false, query: q, error: "no_results", detail: "" };
    }

    const results: WebSearchHit[] = items.filter((item) => {
      if (!item || typeof item !== "object" || typeof item.url !== "string") return false;
      try { return ["http:", "https:"].includes(new URL(item.url).protocol); } catch { return false; }
    }).slice(0, count).map((item) => ({
      title: pickString(item.name) ?? "(无标题)",
      url: pickString(item.url) ?? "",
      snippet: trimSnippet(item.summary ?? item.snippet),
      siteName: pickString(item.siteName),
      datePublished: pickString(item.datePublished)
    }));

    if (!results.length) return { ok: false, query: q, error: "no_results", detail: "No usable source URLs" };
    console.info("[web-search] success", { provider, resultCount: results.length,
      ...(provider === "tavily" ? { credits: body.usage?.credits } : {}) });
    return { ok: true, query: q, results };
  } catch (error) {
    const isAbort = error instanceof Error && error.name === "AbortError";
    const kind: WebSearchErrorKind = isAbort ? "timeout" : "network";
    const detail = error instanceof Error ? error.message.replaceAll(apiKey, "[redacted]").slice(0, 200) : "unknown";
    console.warn("[web-search] failed", { query: q, kind, detail });
    return { ok: false, query: q, error: kind, detail };
  } finally {
    clearTimeout(timeoutId);
    if (opts?.signal) opts.signal.removeEventListener("abort", onCallerAbort);
  }
}
