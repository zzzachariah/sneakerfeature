import OpenAI from "openai";

export const PACKY_MODEL = process.env.PACKYAPI_MODEL ?? "claude-haiku-4-5-20251001";

function normalizeBaseURL(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// packyapi.com is OpenAI-API-compatible, so we reuse the OpenAI SDK and only
// swap the base URL + key. Returns null when env is missing so callers can
// surface a clear "not configured" error instead of throwing.
export function createPackyClient(): OpenAI | null {
  const apiKey = process.env.PACKYAPI_API_KEY;
  const baseURL = process.env.PACKYAPI_BASE_URL;
  if (!apiKey || !baseURL) return null;
  return new OpenAI({ apiKey, baseURL: normalizeBaseURL(baseURL) });
}
