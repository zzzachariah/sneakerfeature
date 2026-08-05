import OpenAI from "openai";

// Accept both naming conventions so deployments configured either way work:
//   PACKYAPI_*  (PACKYAPI_API_KEY / PACKYAPI_BASE_URL)
//   PACKY_API_* (PACKY_API_KEY    / PACKY_API_BASE_URL)
const API_KEY_NAMES = ["PACKYAPI_API_KEY", "PACKY_API_KEY"] as const;
const BASE_URL_NAMES = ["PACKYAPI_BASE_URL", "PACKY_API_BASE_URL"] as const;

function readEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return undefined;
}

// A feature can point at its OWN packyapi key/endpoint (e.g. packyapi issues a
// separate key per model) by passing extra env var names that are checked
// BEFORE the shared PACKYAPI_* / PACKY_API_* ones.
export type PackyClientOptions = {
  apiKeyEnv?: readonly string[];
  baseURLEnv?: readonly string[];
};

function apiKeyNames(opts?: PackyClientOptions): readonly string[] {
  return [...(opts?.apiKeyEnv ?? []), ...API_KEY_NAMES];
}
function baseURLNames(opts?: PackyClientOptions): readonly string[] {
  return [...(opts?.baseURLEnv ?? []), ...BASE_URL_NAMES];
}

export const PACKY_MODEL = "deepseek-v4-pro";

// Premium/tiered models. packyapi issues a SEPARATE key per model, so each of
// these reads its own key env first (see clientOptionsForModel). PACKY_MODEL
// (deepseek) keeps using the shared PACKYAPI_API_KEY.
export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const OPUS_MODEL = "claude-opus-5";

const HAIKU_KEY_ENV = ["PACKYAPI_API_KEY_HAIKU", "PACKY_API_KEY_HAIKU"] as const;
// Legacy names for the SAME packyapi premium group, from when that group was
// reached via the retired Fable model. Kept as a fallback purely so deployments
// that only ever set the _FABLE key keep serving Opus 5 instead of falling
// through to the shared key, whose group may have no Opus channel (→ 503).
const LEGACY_PREMIUM_KEY_ENV = ["PACKYAPI_API_KEY_FABLE", "PACKY_API_KEY_FABLE"] as const;
// Opus 5 (the flagship both paid tiers run) prefers its own key so a dedicated
// one can be configured without a code change, then the legacy premium names.
const OPUS_KEY_ENV = ["PACKYAPI_API_KEY_OPUS", "PACKY_API_KEY_OPUS", ...LEGACY_PREMIUM_KEY_ENV] as const;

// Which per-model key env to prefer for a given model id. Returns undefined for
// the shared/base model. The model-specific names are checked BEFORE the shared
// PACKYAPI_API_KEY, so a missing model key degrades to trying the shared one
// rather than hard-failing (matches the tolerant design of createPackyClient).
export function clientOptionsForModel(model: string): PackyClientOptions | undefined {
  if (model === HAIKU_MODEL) return { apiKeyEnv: HAIKU_KEY_ENV };
  if (model === OPUS_MODEL) return { apiKeyEnv: OPUS_KEY_ENV };
  return undefined;
}

export function createPackyClientForModel(model: string): OpenAI | null {
  return createPackyClient(clientOptionsForModel(model));
}

function normalizeBaseURL(raw: string): string {
  let s = raw.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const url = new URL(s);
    // Bare host (no path) → target the OpenAI-compatible /v1 base, so a value
    // like "https://www.packyapi.com" hits ".../v1/chat/completions". An
    // explicit path (already /v1, or a custom gateway path) is left untouched.
    if (url.pathname === "" || url.pathname === "/") {
      url.pathname = "/v1";
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return s;
  }
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
export function getPackyEnvReport(opts?: PackyClientOptions): PackyEnvReport {
  const optNames = [...(opts?.apiKeyEnv ?? []), ...(opts?.baseURLEnv ?? [])];
  return {
    apiKey: envState(apiKeyNames(opts)),
    baseURL: envState(baseURLNames(opts)),
    detected: Array.from(
      new Set([
        ...Object.keys(process.env).filter((k) => k.toUpperCase().startsWith("PACKY")),
        ...optNames.filter((n) => n in process.env)
      ])
    ).sort()
  };
}

export function describePackyEnvProblem(report: PackyEnvReport, opts?: PackyClientOptions): string {
  const stateText = (s: EnvState) => (s === "missing" ? "未找到" : s === "empty" ? "已设置但值为空" : "正常");
  const problems: string[] = [];
  if (report.apiKey !== "ok") problems.push(`API key（${stateText(report.apiKey)}，可用名：${apiKeyNames(opts).join(" 或 ")}）`);
  if (report.baseURL !== "ok") problems.push(`Base URL（${stateText(report.baseURL)}，可用名：${baseURLNames(opts).join(" 或 ")}）`);
  const detectedText = report.detected.length
    ? `本次部署实际读取到的 PACKY* 变量：${JSON.stringify(report.detected)}`
    : "本次部署未读取到任何以 PACKY 开头的变量";
  return (
    `AI 服务未配置：${problems.join("、")}。${detectedText}。` +
    "请核对变量名是否在上述可用名之列（区分大小写、无多余空格）、是否设置在你正在访问的环境（Production 或 Preview）、值是否非空；修改后必须 Redeploy 才会生效。"
  );
}

// Which env var actually supplied the key for `model`. The fallback inside
// clientOptionsForModel is SILENT, so this is the only way to tell a request
// that used the model's own key from one that quietly borrowed the shared key.
export function resolvedKeyEnvName(model: string): string | null {
  for (const name of apiKeyNames(clientOptionsForModel(model))) {
    if (process.env[name]?.trim()) return name;
  }
  return null;
}

export type PackyTarget = {
  baseURL: string | null;
  /** The model actually sent to the relay for this request. */
  model: string;
  /** Env var name the key came from (never the value). */
  keyEnv: string | null;
  /** True when `model` has dedicated key envs but none were set, so the shared key ran it. */
  sharedKeyFallback: boolean;
};

// The (non-secret) target we send requests to — handy to surface in errors so a
// wrong base URL / model / key is obvious. Never includes the API key value.
// Pass the model the request actually ran on; it defaults to the shared base
// model only for callers that don't do per-request model routing.
export function getPackyTarget(model: string = PACKY_MODEL): PackyTarget {
  const baseURL = readEnv(BASE_URL_NAMES);
  const keyEnv = resolvedKeyEnvName(model);
  const dedicated = clientOptionsForModel(model)?.apiKeyEnv;
  return {
    baseURL: baseURL ? normalizeBaseURL(baseURL) : null,
    model,
    keyEnv,
    sharedKeyFallback: dedicated != null && keyEnv != null && !dedicated.includes(keyEnv)
  };
}

// Admin-readable "where did this request go" line for error surfaces. Calls out
// the shared-key fallback explicitly: a premium model running on the shared key
// lands in that key's relay group, which usually has no channel for it — the
// relay then answers 503 model_not_found and the cause is otherwise invisible.
export function describePackyTarget(model: string = PACKY_MODEL): string {
  const target = getPackyTarget(model);
  const parts = [
    `Base URL：${target.baseURL ?? "(未设置)"}`,
    `模型：${target.model}`,
    `API key 来自：${target.keyEnv ?? "(未找到)"}`
  ];
  if (target.sharedKeyFallback) {
    const names = (clientOptionsForModel(target.model)?.apiKeyEnv ?? []).join(" 或 ");
    parts.push(
      `⚠️ 未配置 ${target.model} 的专属 key（${names}），本次回退使用了共享 key。` +
        "共享 key 所属的中转分组通常没有该模型的渠道，会直接返回 503 model_not_found。" +
        "请在部署环境中设置该模型的专属 key 并 Redeploy。"
    );
  }
  return parts.join("，");
}

// Turn an SDK/network error into a short, admin-readable detail string. Only
// pulls fields that can't contain the API key (status/code/type/body message).
export function describePackyError(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    const meta: string[] = [`HTTP ${error.status ?? "?"}`];
    if (error.code) meta.push(`code=${error.code}`);
    if (error.type) meta.push(`type=${error.type}`);
    const msg = (error.message || "").slice(0, 600);
    return `${meta.join(" ")}${msg ? ` — ${msg}` : ""}`;
  }
  if (error instanceof Error) return (error.message || error.name).slice(0, 600);
  return String(error).slice(0, 600);
}

// packyapi.com is OpenAI-API-compatible, so we reuse the OpenAI SDK and only
// swap the base URL + key. Returns null when env is missing so callers can
// surface a clear "not configured" error instead of throwing.
export function createPackyClient(opts?: PackyClientOptions): OpenAI | null {
  const apiKey = readEnv(apiKeyNames(opts));
  const baseURL = readEnv(baseURLNames(opts));
  if (!apiKey || !baseURL) return null;
  // 3-minute per-request ceiling (reasoning models legitimately take 1-2 min on
  // a big catalog) and a single retry — the SDK default of 10 min × 2 retries
  // left users staring at a spinner for half an hour when the relay hung.
  return new OpenAI({ apiKey, baseURL: normalizeBaseURL(baseURL), timeout: 180_000, maxRetries: 1 });
}
