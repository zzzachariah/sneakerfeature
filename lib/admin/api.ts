// Client-side POST helper for the admin console.
//
// Every admin action used to do `await res.json()` straight away, which throws
// on anything that isn't JSON — a gateway timeout page, an auth redirect, a 502
// from the edge. The throw landed in a bare catch that reported "Network
// error", or (worse) in no catch at all, leaving the operator staring at a
// button that did nothing. This normalises all of it: the result is always
// either data or a message worth showing, and the status code is preserved so a
// 403 (session expired / cross-origin) reads differently from a 504.
export type AdminPostResult<T> = { ok: true; data: T } | { ok: false; message: string; status: number };

export async function adminPost<T>(url: string, body: unknown): Promise<AdminPostResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  } catch (error) {
    console.error("[admin] request failed", url, error);
    return { ok: false, message: "Network error — the request never reached the server. Please retry.", status: 0 };
  }

  const text = await res.text().catch(() => "");
  let json: (Record<string, unknown> & { ok?: boolean; message?: string }) | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    json = null;
  }

  if (!res.ok || !json || json.ok !== true) {
    const fallback =
      res.status === 403
        ? "Forbidden — your admin session may have expired. Reload and sign in again."
        : `Request failed (HTTP ${res.status}).`;
    const message = typeof json?.message === "string" && json.message ? json.message : fallback;
    console.error("[admin] request rejected", url, res.status, text.slice(0, 500));
    return { ok: false, message, status: res.status };
  }

  return { ok: true, data: json as T };
}
