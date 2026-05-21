import OpenAI from "openai";

export const PACKY_MODEL = process.env.PACKYAPI_MODEL?.trim() || "claude-haiku-4-5-20251001";

function normalizeBaseURL(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

// Returns the names of the required env vars that are missing/empty at runtime,
// so callers can tell the user exactly what to set in their deployment.
export function getMissingPackyEnv(): string[] {
  const missing: string[] = [];
  if (!process.env.PACKYAPI_API_KEY?.trim()) missing.push("PACKYAPI_API_KEY");
  if (!process.env.PACKYAPI_BASE_URL?.trim()) missing.push("PACKYAPI_BASE_URL");
  return missing;
}

// packyapi.com is OpenAI-API-compatible, so we reuse the OpenAI SDK and only
// swap the base URL + key. Returns null when env is missing so callers can
// surface a clear "not configured" error instead of throwing.
export function createPackyClient(): OpenAI | null {
  const apiKey = process.env.PACKYAPI_API_KEY?.trim();
  const baseURL = process.env.PACKYAPI_BASE_URL?.trim();
  if (!apiKey || !baseURL) return null;
  return new OpenAI({ apiKey, baseURL: normalizeBaseURL(baseURL) });
}
