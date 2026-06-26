import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const translationCache = new Map<string, string>();
const DEFAULT_LOCALE = "zh";
function parseAndValidateLibreUrl(raw: string | undefined): string | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    console.warn("[i18n/api] LIBRETRANSLATE_URL is not a valid URL — LibreTranslate disabled");
    return null;
  }
  if (parsed.protocol !== "https:") {
    console.warn("[i18n/api] LIBRETRANSLATE_URL must use https: — LibreTranslate disabled");
    return null;
  }
  const hostname = parsed.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    console.warn("[i18n/api] LIBRETRANSLATE_URL points to a private/loopback address — LibreTranslate disabled");
    return null;
  }
  return raw;
}

const LIBRETRANSLATE_URL = parseAndValidateLibreUrl(process.env.LIBRETRANSLATE_URL);
const TRANSLATION_TIMEOUT_MS = 10000;
const isI18nDebugEnabled = process.env.I18N_DEBUG === "1";
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const SAFE_TRANSLATION_CHARS = 420;
const MAX_TEXT_LENGTH = 10_000;
const ALLOWED_LOCALES = new Set(["zh", "en", "es", "fr", "de", "ja", "ko", "pt", "ru", "ar"]);

const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_MAX;
}

const OFFLINE_ZH_EXACT: Record<string, string> = {
  "full-length boom forefoot": "全掌 BOOM 前掌",
  "flight plate with zoom air forefoot": "前掌搭载 Zoom Air 的 Flight Plate",
  "rubber traction with tacky broad multi-directional pattern": "橡胶外底，抓地黏性强，宽大多向纹路",
  "comfortable and lively": "舒适且回弹灵动",
  "very good": "很好",
  "slightly narrow but very secure": "略窄，但包裹非常稳固"
};
const CURRY_NAME_CORRECTIONS_ZH: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /史蒂芬[\s·.-]*咖喱/g, replacement: "斯蒂芬·库里" },
  { pattern: /斯蒂芬[\s·.-]*咖喱/g, replacement: "斯蒂芬·库里" },
  { pattern: /咖喱\s*13/g, replacement: "库里 13" },
  { pattern: /咖喱\s*12/g, replacement: "库里 12" },
  { pattern: /咖喱/g, replacement: "库里" }
];

function makeCacheKey(text: string, target: string) {
  return `${target}::${text}`;
}

function shouldSkip(text: string) {
  const trimmed = text.trim();
  const normalized = trimmed.toLowerCase();
  if (!trimmed) return true;
  if (normalized === "sneakerfeature") return true;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return true;
  if (/^(nike|adidas|jordan|anta|li-ning)$/i.test(trimmed)) return true;
  if (/^(boost|zoom|zoomx|cushlon|lightstrike|boom|boom foam|zoom air)$/i.test(trimmed)) return true;
  return false;
}

function translateOffline(text: string, target: string) {
  if (target !== "zh") return null;

  const trimmed = text.trim();
  const punctMatch = trimmed.match(/[.?!]+$/);
  const trailingPunctuation = punctMatch?.[0] ?? "";
  const core = trailingPunctuation ? trimmed.slice(0, -trailingPunctuation.length).trim() : trimmed;
  const normalized = core.toLowerCase();

  if (OFFLINE_ZH_EXACT[normalized]) {
    return `${OFFLINE_ZH_EXACT[normalized]}${trailingPunctuation}`;
  }

  return null;
}

function includesBackendLimitError(text: string) {
  return /query length limit exceeded|max allowed query/i.test(text);
}

function normalizeTranslatedOrFallback(original: string, translated: string | null | undefined) {
  const cleaned = (translated ?? "").trim();
  if (!cleaned) return original;
  if (includesBackendLimitError(cleaned)) return original;
  return cleaned;
}

function applyProperNounOverridesForZh(original: string, translated: string) {
  if (!/\bcurry\b/i.test(original)) return translated;

  let corrected = translated;
  for (const { pattern, replacement } of CURRY_NAME_CORRECTIONS_ZH) {
    corrected = corrected.replace(pattern, replacement);
  }

  if (/\bstephen\s+curry\b/i.test(original)) {
    corrected = corrected.replace(/斯蒂芬[\s·.-]*库里/g, "斯蒂芬·库里");
  }

  return corrected;
}

function applyProperNounOverrides(original: string, translated: string, target: string) {
  if (target !== "zh") return translated;
  return applyProperNounOverridesForZh(original, translated);
}

function splitByPeriods(text: string) {
  const parts = text.match(/[^.]+\.?|\.{1,}/g);
  if (!parts) return [text];
  return parts.map((part) => part.trim()).filter(Boolean);
}

function splitLongUnit(text: string, maxChars: number) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > maxChars) {
    let index = remaining.lastIndexOf(" ", maxChars);
    if (index < Math.floor(maxChars * 0.5)) {
      index = maxChars;
    }
    chunks.push(remaining.slice(0, index).trim());
    remaining = remaining.slice(index).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks.filter(Boolean);
}

function splitForTranslation(text: string, maxChars: number) {
  const sentenceUnits = splitByPeriods(text);
  const finalUnits: string[] = [];

  for (const sentence of sentenceUnits) {
    if (sentence.length <= maxChars) {
      finalUnits.push(sentence);
      continue;
    }
    finalUnits.push(...splitLongUnit(sentence, maxChars));
  }

  return finalUnits.filter(Boolean);
}

async function translateWithLibre(text: string, target: string) {
  if (!LIBRETRANSLATE_URL) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TRANSLATION_TIMEOUT_MS);

  try {
    const response = await fetch(LIBRETRANSLATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text, source: "auto", target, format: "text" }),
      signal: controller.signal,
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { translatedText?: string };
    return data.translatedText ?? null;
  } finally {
    clearTimeout(timeout);
  }
}

async function translateWithMyMemory(text: string, target: string) {
  const languagePair = `en|${target === "zh" ? "zh-CN" : target}`;
  const url = new URL(MYMEMORY_URL);
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", languagePair);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) return null;

  const payload = (await response.json()) as {
    responseData?: { translatedText?: string };
  };

  const translated = payload.responseData?.translatedText?.trim();
  return translated || null;
}

export async function POST(request: NextRequest) {
  // Auth check: only authenticated users may call this endpoint.
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ ok: false, message: "Server error" }, { status: 500 });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  // Per-IP rate limit to prevent abuse even for authenticated callers.
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    const body = (await request.json()) as { text?: string; target?: string };
    const text = String(body.text ?? "").trim();
    const target = String(body.target ?? DEFAULT_LOCALE);

    // Restrict accepted locales to a known-good allowlist to limit abuse surface.
    if (!ALLOWED_LOCALES.has(target)) {
      return NextResponse.json({ translatedText: "", reason: "unsupported_locale" }, { status: 400 });
    }

    // Cap body size before any downstream network calls.
    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json({ translatedText: "", reason: "text_too_long" }, { status: 400 });
    }

    if (isI18nDebugEnabled) {
      console.log("[i18n/api] request", { text, target });
    }

    if (!text) return NextResponse.json({ translatedText: "" });
    if (shouldSkip(text)) {
      if (isI18nDebugEnabled) {
        console.log("[i18n/api] skipped", { text, reason: "shouldSkip" });
      }
      return NextResponse.json({ translatedText: text, cached: true });
    }

    const cacheKey = makeCacheKey(text, target);
    const cached = translationCache.get(cacheKey);
    if (cached) {
      if (isI18nDebugEnabled) {
        console.log("[i18n/api] cache hit", { cacheKey, value: cached });
      }
      return NextResponse.json({ translatedText: cached, cached: true });
    }

    const shouldForceSplit = text.length > SAFE_TRANSLATION_CHARS;
    const units = shouldForceSplit ? splitForTranslation(text, SAFE_TRANSLATION_CHARS) : [text];
    if (isI18nDebugEnabled && shouldForceSplit) {
      console.log("[i18n/api] force sentence split", {
        originalLength: text.length,
        units: units.length,
        maxChars: SAFE_TRANSLATION_CHARS
      });
    }

    const translatedUnits: string[] = [];
    for (const unit of units) {
      const unitCacheKey = makeCacheKey(unit, target);
      const unitCached = translationCache.get(unitCacheKey);
      if (unitCached) {
        translatedUnits.push(unitCached);
        continue;
      }

      let translatedUnit = unit;

      if (LIBRETRANSLATE_URL) {
        const libreTranslated = await translateWithLibre(unit, target);
        translatedUnit = normalizeTranslatedOrFallback(unit, libreTranslated);
      } else {
        if (isI18nDebugEnabled) {
          console.log("[i18n/api] no LIBRETRANSLATE_URL; trying fallback provider", { text: unit, target });
        }
        try {
          const fallbackTranslated = await translateWithMyMemory(unit, target);
          if (fallbackTranslated) {
            translatedUnit = normalizeTranslatedOrFallback(unit, fallbackTranslated);
          }
        } catch (fallbackError) {
          if (isI18nDebugEnabled) {
            console.log("[i18n/api] fallback translation failed", { text: unit, target, error: fallbackError });
          }
        }

        if (translatedUnit === unit) {
          const offlineTranslated = translateOffline(unit, target);
          if (offlineTranslated) translatedUnit = offlineTranslated;
        }
      }

      translatedUnit = applyProperNounOverrides(unit, translatedUnit, target);

      translationCache.set(unitCacheKey, translatedUnit);
      translatedUnits.push(translatedUnit);
    }

    const mergedTranslation = translatedUnits.join(" ").replace(/\s+([,.!?;:])/g, "$1").trim();
    translationCache.set(cacheKey, mergedTranslation || text);
    return NextResponse.json({
      translatedText: mergedTranslation || text,
      cached: false,
      provider: LIBRETRANSLATE_URL ? "libretranslate" : "fallback_chain",
      splitApplied: shouldForceSplit
    });
  } catch {
    return NextResponse.json({ translatedText: "", reason: "invalid_request" }, { status: 400 });
  }
}
