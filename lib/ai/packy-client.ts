import OpenAI from "openai";

export const PACKY_MODEL = process.env.PACKYAPI_MODEL?.trim() || "claude-haiku-4-5-20251001";

function normalizeBaseURL(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type EnvState = "ok" | "empty" | "missing";

function envState(name: string): EnvState {
  if (!(name in process.env)) return "missing";
  return process.env[name]?.trim() ? "ok" : "empty";
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
    apiKey: envState("PACKYAPI_API_KEY"),
    baseURL: envState("PACKYAPI_BASE_URL"),
    detected: Object.keys(process.env)
      .filter((k) => k.toUpperCase().startsWith("PACKY"))
      .sort()
  };
}

export function describePackyEnvProblem(report: PackyEnvReport): string {
  const stateText = (s: EnvState) => (s === "missing" ? "未找到" : s === "empty" ? "已设置但值为空" : "正常");
  const problems: string[] = [];
  if (report.apiKey !== "ok") problems.push(`PACKYAPI_API_KEY（${stateText(report.apiKey)}）`);
  if (report.baseURL !== "ok") problems.push(`PACKYAPI_BASE_URL（${stateText(report.baseURL)}）`);
  const detectedText = report.detected.length
    ? `本次部署实际读取到的 PACKY* 变量：${JSON.stringify(report.detected)}`
    : "本次部署未读取到任何以 PACKY 开头的变量";
  return (
    `AI 服务未配置：${problems.join("、")}。${detectedText}。` +
    "请核对：变量名是否完全一致（区分大小写、无多余空格）、是否设置在你正在访问的环境（Production 或 Preview）、值是否非空；修改后必须 Redeploy 才会生效。"
  );
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
