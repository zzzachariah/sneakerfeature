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

// Tagged error categories so callers/operators can tell "wrong key" from "no
// results" from "timeout" at a glance. `detail` holds the upstream `msg` /
// status / error string for diagnostics.
export type BochaErrorKind =
  | "missing_api_key"
  | "empty_query"
  | "auth"          // HTTP 401 / 403 — bad or revoked key
  | "rate_limited"  // HTTP 429
  | "upstream"      // HTTP 5xx / non-200 `code`
  | "network"       // fetch threw (DNS, refused, etc.)
  | "timeout"
  | "parse"
  | "no_results"
  | "unknown";

export type WebSearchResult =
  | { ok: true; query: string; results: WebSearchHit[] }
  | { ok: false; query: string; error: BochaErrorKind; detail: string };

export function isBochaConfigured(): boolean {
  return Boolean(process.env[BOCHA_API_KEY_NAME]?.trim());
}

// Human-readable Chinese explanation for a Bocha error — used in server logs
// and admin-facing diagnostic strings. Mirrors describePackyError shape.
export function describeBochaError(kind: BochaErrorKind, detail?: string): string {
  const tail = detail ? `（${detail}）` : "";
  switch (kind) {
    case "missing_api_key":
      return `Bocha 未配置：环境变量 ${BOCHA_API_KEY_NAME} 缺失或为空${tail}`;
    case "empty_query":
      return `Bocha 调用时 query 为空${tail}`;
    case "auth":
      return `Bocha 鉴权失败，请检查 ${BOCHA_API_KEY_NAME} 是否正确、是否已激活${tail}`;
    case "rate_limited":
      return `Bocha 触发限流，稍后重试${tail}`;
    case "upstream":
      return `Bocha 服务端错误${tail}`;
    case "network":
      return `Bocha 网络异常${tail}`;
    case "timeout":
      return `Bocha 请求超时${tail}`;
    case "parse":
      return `Bocha 返回内容解析失败${tail}`;
    case "no_results":
      return `Bocha 未返回任何结果${tail}`;
    default:
      return `Bocha 未知错误${tail}`;
  }
}

function categorizeHttpStatus(status: number): BochaErrorKind {
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

export async function bochaWebSearch(
  query: string,
  opts?: { count?: number; freshness?: string; timeoutMs?: number; signal?: AbortSignal }
): Promise<WebSearchResult> {
  const apiKey = process.env[BOCHA_API_KEY_NAME]?.trim();
  if (!apiKey) {
    console.warn("[web-search] missing_api_key", { hint: `set env ${BOCHA_API_KEY_NAME}` });
    return { ok: false, query, error: "missing_api_key", detail: BOCHA_API_KEY_NAME };
  }

  const q = (query ?? "").trim();
  if (!q) return { ok: false, query: q, error: "empty_query", detail: "" };

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
      // Best-effort read upstream body for the operator log — Bocha returns
      // `{ code, msg }` shape on errors too. Truncate so a giant HTML error
      // page can't blow up logs.
      const rawMsg = (await res.text().catch(() => "")).slice(0, 300);
      const kind = categorizeHttpStatus(res.status);
      const detail = `HTTP ${res.status}${rawMsg ? ` — ${rawMsg}` : ""}`;
      console.warn("[web-search] http error", { query: q, status: res.status, kind, msg: rawMsg.slice(0, 120) });
      return { ok: false, query: q, error: kind, detail };
    }

    let body: { code?: number; msg?: string; data?: { webPages?: { value?: BochaItem[] } } };
    try {
      body = await res.json();
    } catch (parseErr) {
      const detail = parseErr instanceof Error ? parseErr.message.slice(0, 200) : "non-JSON response";
      console.warn("[web-search] parse error", { query: q, detail });
      return { ok: false, query: q, error: "parse", detail };
    }

    if (typeof body.code === "number" && body.code !== 200) {
      const upstreamMsg = (body.msg ?? "").slice(0, 300);
      // Bocha sometimes signals auth via `code` instead of HTTP status.
      const kind: BochaErrorKind =
        body.code === 401 || body.code === 403
          ? "auth"
          : body.code === 429
            ? "rate_limited"
            : "upstream";
      const detail = `code ${body.code}${upstreamMsg ? ` — ${upstreamMsg}` : ""}`;
      console.warn("[web-search] api error", { query: q, code: body.code, kind, msg: upstreamMsg.slice(0, 120) });
      return { ok: false, query: q, error: kind, detail };
    }

    const items = body.data?.webPages?.value ?? [];
    if (!Array.isArray(items) || items.length === 0) {
      console.warn("[web-search] no_results", { query: q });
      return { ok: false, query: q, error: "no_results", detail: "" };
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
    const isAbort = error instanceof Error && error.name === "AbortError";
    const kind: BochaErrorKind = isAbort ? "timeout" : "network";
    const detail = error instanceof Error ? error.message.slice(0, 200) : "unknown";
    console.warn("[web-search] failed", { query: q, kind, detail });
    return { ok: false, query: q, error: kind, detail };
  } finally {
    clearTimeout(timeoutId);
    if (opts?.signal) opts.signal.removeEventListener("abort", onCallerAbort);
  }
}
