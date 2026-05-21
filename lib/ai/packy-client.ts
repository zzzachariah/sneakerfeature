import OpenAI from "openai";

// Accept both naming conventions so deployments configured either way work:
//   PACKYAPI_*  (PACKYAPI_API_KEY / PACKYAPI_BASE_URL / PACKYAPI_MODEL)
//   PACKY_API_* (PACKY_API_KEY    / PACKY_API_BASE_URL / PACKY_API_MODEL)
const API_KEY_NAMES = ["PACKYAPI_API_KEY", "PACKY_API_KEY"] as const;
const BASE_URL_NAMES = ["PACKYAPI_BASE_URL", "PACKY_API_BASE_URL"] as const;
const MODEL_NAMES = ["PACKYAPI_MODEL", "PACKY_API_MODEL"] as const;

function readEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

export const PACKY_MODEL = readEnv(MODEL_NAMES) ?? "claude-haiku-4-5-20251001";

function normalizeBaseURL(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type EnvState = "ok" | "empty" | "missing";

function envState(names: readonly string[]): EnvState {
  let anyPresent = false;
  for (const name of names) {
    if (name in process.env) {
      anyPresent = true;
      if (process.env[name]?.trim()) return "ok";
    }
  }
  return anyPresent ? "empty" : "missing";
}

export type PackyEnvReport = {
  apiKey: EnvState;
  baseURL: EnvState;
  detected: string[];
};

// Snapshot of what the *running* deployment actually sees. `detected` lists the
// real env var names beginning with "PACKY" (case-insensitive) so a typo,
// wrong casing, or stray whitespace in the name is immediately visible — the
// values themselves are never exposed.
export function getPackyEnvReport(): PackyEnvReport {
  return {
    apiKey: envState(API_KEY_NAMES),
    baseURL: envState(BASE_URL_NAMES),
    detected: Object.keys(process.env)
      .filter((k) => k.toUpperCase().startsWith("PACKY"))
      .sort()
  };
}

export function describePackyEnvProblem(report: PackyEnvReport): string {
  const stateText = (s: EnvState) => (s === "missing" ? "未找到" : s === "empty" ? "已设置但值为空" : "正常");
  const problems: string[] = [];
  if (report.apiKey !== "ok") problems.push(`API key（${stateText(report.apiKey)}，可用名：${API_KEY_NAMES.join(" 或 ")}）`);
  if (report.baseURL !== "ok") problems.push(`Base URL（${stateText(report.baseURL)}，可用名：${BASE_URL_NAMES.join(" 或 ")}）`);
  const detectedText = report.detected.length
    ? `本次部署实际读取到的 PACKY* 变量：${JSON.stringify(report.detected)}`
    : "本次部署未读取到任何以 PACKY 开头的变量";
  return (
    `AI 服务未配置：${problems.join("、")}。${detectedText}。` +
    "请核对变量名是否在上述可用名之列（区分大小写、无多余空格）、是否设置在你正在访问的环境（Production 或 Preview）、值是否非空；修改后必须 Redeploy 才会生效。"
  );
}

// packyapi.com is OpenAI-API-compatible, so we reuse the OpenAI SDK and only
// swap the base URL + key. Returns null when env is missing so callers can
// surface a clear "not configured" error instead of throwing.
export function createPackyClient(): OpenAI | null {
  const apiKey = readEnv(API_KEY_NAMES);
  const baseURL = readEnv(BASE_URL_NAMES);
  if (!apiKey || !baseURL) return null;
  return new OpenAI({ apiKey, baseURL: normalizeBaseURL(baseURL) });
}
