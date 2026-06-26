// Server-side foot-shape analysis.
//
// The vision model (Claude via the packyapi relay) reads the guided photos. The
// model only has to *point* at anatomical landmarks; every measurement is then
// computed deterministically in code (geometry.ts). Accuracy levers, all on the
// SAME three photos (no extra shots asked of the user):
//
//  1. Landmark geometry. Width/length, hallux deviation and the arch-height
//     index are computed from named landmark points, not eyeballed by the model.
//  2. Landmark-level self-consistency. Each scan is read a few times; the POINTS
//     are aggregated per-point (coordinate median) into one consensus set, then
//     the ratios are computed once. A single mis-placed point is outvoted rather
//     than corrupting a whole read, and the per-point spread gives an honest
//     confidence. Adaptive: extra reads fire only when the first ones disagree.
//  3. IMU correction. The capture screen records the phone's tilt at the shutter
//     (beta/gamma). A grossly wrong angle is gated for a re-take; a mild residual
//     tilt is corrected out of the width ratio (correctRatioForTilt) — recovering
//     the part of the accuracy a paper/card reference would have given, without
//     asking the user to find one.
//
// Classification + the mm conversion stay in code (classify.ts / config.ts) so
// the boundaries remain explicit and tunable against a validation set.

import OpenAI from "openai";
import { describePackyError } from "@/lib/ai/packy-client";
import {
  widthClassFromRatio,
  widthMmFromRatio,
  otherSide,
  sanitizeRatio,
  halluxClassFromRatio,
  halluxAngleFromRatio,
  instepClassFromAhi
} from "@/lib/foot-scan/classify";
import { FOOT_SCAN_CONFIG } from "@/lib/foot-scan/config";
import {
  parseImageSize,
  parseLandmarks,
  ratioFromPoints,
  halluxRatioFromPoints,
  ahiFromPoints,
  ballPositionFraction,
  correctRatioForTilt,
  rectifiedRatioWithFov,
  medianLandmarks,
  isDegenerateTop,
  type ImageSize,
  type NormLandmarks
} from "@/lib/foot-scan/geometry";
import {
  isInstepClass,
  isToeShape,
  isConfidence,
  type Confidence,
  type FootScanResult,
  type FootSide,
  type HalluxClass,
  type InstepClass,
  type RetakeRequest,
  type ToeShape,
  type ViewId
} from "@/lib/foot-scan/types";

// A stronger vision model markedly helps the fine visual calls (toe boundaries,
// instep doming, landmark placement). Set FOOT_SCAN_MODEL to the exact model
// string your packyapi account exposes; falls back to the pinned default below
// when unset.
const VISION_MODEL = process.env.FOOT_SCAN_MODEL?.trim() || "claude-haiku-4-5-20251001";

// The OpenAI-compatible endpoint for packyapi. Hardcoded so the only thing the
// deployment has to configure is FOOT_SCAN_API_KEY.
const FOOT_SCAN_BASE_URL = "https://www.packyapi.com/v1";

function createFootScanClient(): OpenAI | null {
  const apiKey = process.env.FOOT_SCAN_API_KEY?.trim();
  if (!apiKey) return null;
  return new OpenAI({ apiKey, baseURL: FOOT_SCAN_BASE_URL });
}

// Non-secret fingerprint of the key actually loaded by this deployment, so a
// 403 vs the packyapi dashboard can be cross-checked ("is this the token I set
// in Vercel?") without ever exposing the full secret.
function footScanKeyFingerprint(): { fingerprint: string; length: number } | null {
  const raw = process.env.FOOT_SCAN_API_KEY?.trim();
  if (!raw) return null;
  const head = raw.slice(0, 6);
  const tail = raw.length > 10 ? raw.slice(-4) : "";
  return { fingerprint: tail ? `${head}…${tail}` : head, length: raw.length };
}

function describeFootScanEnvProblem(): string {
  const raw = process.env.FOOT_SCAN_API_KEY;
  const state = raw === undefined ? "未找到" : raw.trim() ? "正常" : "已设置但值为空";
  return (
    `AI 服务未配置：FOOT_SCAN_API_KEY（${state}）。` +
    `请在 Vercel 的环境变量中设置 FOOT_SCAN_API_KEY,然后 Redeploy 才会生效。`
  );
}

// Initial reads per scan (env overrides the config default). The adaptive pass
// may top this up to maxCount when the first reads disagree.
const SAMPLE_COUNT = (() => {
  const n = Number.parseInt(process.env.FOOT_SCAN_SAMPLES ?? "", 10);
  if (Number.isFinite(n)) return Math.min(FOOT_SCAN_CONFIG.sampling.maxCount, Math.max(1, n));
  return FOOT_SCAN_CONFIG.sampling.count;
})();

const MAX_SAMPLES = FOOT_SCAN_CONFIG.sampling.maxCount;

// Sampling temperature used only when more than one read is taken, to give the
// runs enough variety to average. If the model/relay rejects `temperature`, the
// call is retried without it (see runSample).
const SAMPLE_TEMPERATURE = (() => {
  const t = Number.parseFloat(process.env.FOOT_SCAN_TEMPERATURE ?? "");
  return Number.isFinite(t) && t >= 0 && t <= 1 ? t : FOOT_SCAN_CONFIG.sampling.temperature;
})();

export type Tilt = { beta?: number | null; gamma?: number | null; fovDeg?: number | null };

export type AnalyzeInput = {
  // The chosen/primary foot we run the full 3-view analysis on.
  primarySide: FootSide;
  footLengthMm: number;
  // UI language for the prose fields ("zh" | "en").
  locale?: string;
  images: {
    top: string; // data URL — top-down of the primary foot
    oblique: string; // 45° front-oblique of the primary foot
    side: string; // lateral side of the primary foot
    top_other?: string | null; // top-down of the other foot (optional)
  };
  // Device tilt recorded at the shutter, per view (live capture only). Absent /
  // null entries simply skip the gate + correction for that view.
  tilt?: Partial<Record<ViewId, Tilt | null>> | null;
  // The user's recent scans (same foot is an unchanging quantity), used to fuse
  // the width ratio across sessions and shrink its variance. Supplied by the
  // route from stored history; empty/absent disables cross-session fusion.
  priors?: { primarySide: FootSide; footLengthMm: number; widthRatio: number | null; widthConf: Confidence }[];
};

export type AnalyzeOutcome =
  | { ok: true; result: FootScanResult }
  | { ok: false; error: string; detail?: string };

const VIEW_LABELS: Record<ViewId, string> = {
  top: "top-down view of the primary foot",
  oblique: "45° front-oblique view of the primary foot",
  side: "lateral (outer) side view of the primary foot",
  top_other: "top-down view of the OTHER foot"
};

// Pull the JSON object out of a model reply, tolerating code fences and any
// stray prose before/after the object.
function extractJson(text: string): string {
  const stripped = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const first = stripped.indexOf("{");
  const last = stripped.lastIndexOf("}");
  return first >= 0 && last > first ? stripped.slice(first, last + 1) : stripped;
}

function asConfidence(v: unknown): Confidence {
  return isConfidence(v) ? v : "low";
}
function asInstep(v: unknown): InstepClass {
  return isInstepClass(v) ? v : "normal";
}
function asToe(v: unknown): ToeShape {
  return isToeShape(v) ? v : "egyptian";
}

const PROMPT = `You are a careful footwear-fitting assistant estimating basic foot shape from guided photos of ONE person's feet. This is an indicative estimate for shoe sizing, NOT a medical diagnosis.

Each image is labelled. Judge each for usability first. Read the bare-foot OUTLINE: if the person wears thin socks, estimate through them; only when thick socks blur the outline or merge the toes should you lower the affected confidence (set toe_confidence "low" when individual toes can't be separated). Judge the foot's REAL proportions — mentally correct for camera tilt and perspective, and do not let the quoted reference length bias what you actually see.

First reason briefly in "reasoning": describe the foot's outline in the TOP-DOWN photo and where its key points lie. Then report:

A) TOP-DOWN LANDMARKS on the PRIMARY foot. Give each as [x, y] where x = fraction of image WIDTH (0 = left edge, 1 = right edge) and y = fraction of image HEIGHT (0 = top edge, 1 = bottom edge):
   - heel: the rear-most point of the heel.
   - toe: the tip of the LONGEST toe (whichever reaches furthest forward).
   - wide_medial: the widest point of the INNER edge (big-toe-side ball, ~1st metatarsal head).
   - wide_lateral: the widest point of the OUTER edge (little-toe-side ball, ~5th metatarsal head).
   - mtp1: the centre of the big-toe knuckle joint (1st metatarsophalangeal joint, where the big toe meets the foot).
   - hallux_tip: the tip of the BIG toe specifically.
   Pick the true anatomical extremes even if the foot is rotated or tilted in the frame. If a point is hidden or cut off, give your best estimate and lower the relevant confidence.

B) SIDE-VIEW LANDMARKS from the lateral (outer) side photo, same [x, y] coordinate system on THAT image:
   - heel_ground: where the heel meets the floor.
   - mtp1_ground: where the ball of the foot meets the floor (front contact point).
   - dorsum_apex: the top-of-foot (instep) point directly ABOVE THE MIDPOINT of the foot length — i.e. over the halfway point between heel_ground and mtp1_ground (~50% of foot length), NOT necessarily the globally highest point.
   If the side photo is unusable, set side landmarks to null.

C) TRAITS:
   - width_ratio: foot maximum width ÷ heel-to-longest-toe length, as a single decimal. Estimate this INDEPENDENTLY of the landmarks (a cross-check). Reference: narrow ~0.34-0.37, average ~0.38-0.40, wide ~0.42-0.46, very wide ≥0.46.
   - toe_shape, by comparing the toe tips in the TOP-DOWN photo:
       "egyptian" = big toe is longest and the toes step down in order;
       "greek" = the SECOND toe is the longest;
       "roman" = the first two or three toes end about level;
       "square" = all toes end on nearly the same line (flat toe front).
   - instep, the height/volume of the top of the midfoot:
       "low" = the top of the foot looks flat or thin in profile;
       "normal" = a gentle dome;
       "high" = a pronounced dome that sits tall.
     Read the SIDE photo for the height silhouette and the 45° OBLIQUE photo for how much it domes — use both.

Give every trait an honest confidence ("low" / "medium" / "high"); if the view it needs is poor, say "low".

If an OTHER-foot top-down photo is provided, also give its four extreme landmarks (heel, toe, wide_medial, wide_lateral), its width_ratio, and length_vs_primary (its heel-to-toe length ÷ the primary foot's, typically 0.95-1.05).

Reply with STRICT JSON only — no markdown, no commentary:
{
  "reasoning": "1-2 sentences on the outline and where the key points sit",
  "primary": {
    "view_quality": { "top": "ok|blurry|cropped|wrong_view|too_dark", "oblique": "ok|blurry|cropped|wrong_view|too_dark", "side": "ok|blurry|cropped|wrong_view|too_dark" },
    "landmarks": { "heel": [0.50, 0.90], "toe": [0.50, 0.10], "wide_medial": [0.38, 0.42], "wide_lateral": [0.62, 0.46], "mtp1": [0.40, 0.40], "hallux_tip": [0.44, 0.12] },
    "side_landmarks": { "heel_ground": [0.15, 0.80], "mtp1_ground": [0.80, 0.80], "dorsum_apex": [0.45, 0.45] },
    "width_ratio": 0.39,
    "width_confidence": "low|medium|high",
    "toe_shape": "egyptian|greek|roman|square",
    "toe_confidence": "low|medium|high",
    "instep": "low|normal|high",
    "instep_confidence": "low|medium|high"
  },
  "other": { "view_quality": { "top_other": "ok|blurry|cropped|wrong_view|too_dark" }, "landmarks": { "heel": [0,0], "toe": [0,0], "wide_medial": [0,0], "wide_lateral": [0,0] }, "width_ratio": 0.39, "length_vs_primary": 1.0 },
  "summary": "one short, friendly paragraph describing the foot shape in plain language",
  "cautions": ["short caveats, e.g. lighting/angle limits"]
}
Set "other" to null if no other-foot photo was given. Set "side_landmarks" to null if the side view is unusable.`;

// --- One read of the scan --------------------------------------------------

type PrimaryQuality = Record<"top" | "oblique" | "side", string | null>;

type Sample = {
  quality: PrimaryQuality;
  top: NormLandmarks;
  side: NormLandmarks;
  modelRatio: number | null;
  modelWidthConf: Confidence;
  toe: ToeShape;
  toeConf: Confidence;
  instep: InstepClass;
  instepConf: Confidence;
  summary: string;
  cautions: string[];
  other: { quality: string | null; landmarks: NormLandmarks; lengthVsPrimary: number } | null;
};

type SampleResult = { ok: true; sample: Sample } | { ok: false; error: string };

async function runSample(
  client: OpenAI,
  content: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  temperature: number,
  model: string,
  hasOther: boolean,
  index: number
): Promise<SampleResult> {
  // The relay does not lift an OpenAI `system` turn into Anthropic's system
  // field, so everything rides in a single user turn.
  const base = {
    model,
    max_tokens: 1600,
    messages: [{ role: "user" as const, content }]
  };

  const t0 = Date.now();
  let raw: string;
  try {
    let completion;
    try {
      completion = await client.chat.completions.create({ ...base, temperature });
    } catch (e) {
      // Opus-tier models reject `temperature` on the native API; some relays
      // forward it. Retry once without it so a model upgrade can't break the
      // call — self-consistency then relies on the model's own default variance.
      if (e instanceof OpenAI.APIError && e.status === 400) {
        console.warn("[foot-scan] sample retrying without temperature", { index, model, status: e.status });
        completion = await client.chat.completions.create(base);
      } else {
        throw e;
      }
    }
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (e) {
    const error = describePackyError(e);
    console.error("[foot-scan] sample API call failed", { index, model, durationMs: Date.now() - t0, error });
    return { ok: false, error };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(raw)) as Record<string, unknown>;
  } catch {
    console.error("[foot-scan] sample JSON parse failed", {
      index,
      model,
      durationMs: Date.now() - t0,
      rawPreview: raw.slice(0, 300)
    });
    return { ok: false, error: raw.slice(0, 300) };
  }

  const primary = (parsed.primary ?? {}) as Record<string, unknown>;
  const pq = (primary.view_quality ?? {}) as Record<string, unknown>;
  const quality: PrimaryQuality = {
    top: typeof pq.top === "string" ? pq.top : null,
    oblique: typeof pq.oblique === "string" ? pq.oblique : null,
    side: typeof pq.side === "string" ? pq.side : null
  };

  const top = parseLandmarks(primary.landmarks);
  const side = parseLandmarks(primary.side_landmarks);
  const modelRatio = sanitizeRatio(primary.width_ratio);

  let other: Sample["other"] = null;
  if (hasOther) {
    const o = (parsed.other ?? null) as Record<string, unknown> | null;
    if (o) {
      const oq = (o.view_quality ?? {}) as Record<string, unknown>;
      const lvpRaw = o.length_vs_primary;
      const lvp = typeof lvpRaw === "number" && lvpRaw > 0.8 && lvpRaw < 1.2 ? lvpRaw : 1;
      other = {
        quality: typeof oq.top_other === "string" ? oq.top_other : null,
        landmarks: parseLandmarks(o.landmarks),
        lengthVsPrimary: lvp
      };
    }
  }

  return {
    ok: true,
    sample: {
      quality,
      top,
      side,
      modelRatio,
      modelWidthConf: asConfidence(primary.width_confidence),
      toe: asToe(primary.toe_shape),
      toeConf: asConfidence(primary.toe_confidence),
      instep: asInstep(primary.instep),
      instepConf: asConfidence(primary.instep_confidence),
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      cautions: Array.isArray(parsed.cautions)
        ? parsed.cautions.filter((c): c is string => typeof c === "string")
        : [],
      other
    }
  };
}

// --- Public entry point ----------------------------------------------------

export async function analyzeFootScan(input: AnalyzeInput): Promise<AnalyzeOutcome> {
  const client = createFootScanClient();
  if (!client) {
    const detail = describeFootScanEnvProblem();
    console.error("[foot-scan] client not configured", { detail });
    return {
      ok: false,
      error: "AI service is not configured.",
      detail
    };
  }
  console.info("[foot-scan] analyze start", {
    model: VISION_MODEL,
    baseURL: FOOT_SCAN_BASE_URL,
    keyConfigured: Boolean(process.env.FOOT_SCAN_API_KEY?.trim()),
    sampleCount: SAMPLE_COUNT,
    maxSamples: MAX_SAMPLES,
    temperature: SAMPLE_TEMPERATURE,
    priorCount: input.priors?.length ?? 0,
    hasOther: Boolean(input.images.top_other)
  });

  const language = input.locale === "zh" ? "Simplified Chinese" : "English";
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: PROMPT },
    {
      type: "text",
      text: `\nWrite the "summary" and "cautions" fields in ${language}. The classification enum values stay in English as specified.`
    },
    { type: "text", text: `\nReference foot length (anchor): ${input.footLengthMm} mm. Primary foot: ${input.primarySide}.` },
    { type: "text", text: `\n[Image: ${VIEW_LABELS.top}]` },
    { type: "image_url", image_url: { url: input.images.top } },
    { type: "text", text: `\n[Image: ${VIEW_LABELS.oblique}]` },
    { type: "image_url", image_url: { url: input.images.oblique } },
    { type: "text", text: `\n[Image: ${VIEW_LABELS.side}]` },
    { type: "image_url", image_url: { url: input.images.side } }
  ];
  if (input.images.top_other) {
    content.push({ type: "text", text: `\n[Image: ${VIEW_LABELS.top_other}]` });
    content.push({ type: "image_url", image_url: { url: input.images.top_other } });
  }

  const hasOther = Boolean(input.images.top_other);

  const temperature = SAMPLE_COUNT > 1 ? SAMPLE_TEMPERATURE : 0;

  const runBatch = (n: number, startIndex: number) =>
    Promise.all(
      Array.from({ length: n }, (_, i) =>
        runSample(client, content, temperature, VISION_MODEL, hasOther, startIndex + i)
      )
    );

  // Collect successes; keep ALL error strings so the final failure detail shows
  // every distinct reason, not just the last one (which often masks a transient
  // success-then-fail mix).
  const allErrors: string[] = [];
  const collect = (results: SampleResult[], into: Sample[]) => {
    let err = "";
    for (const r of results) {
      if (r.ok) into.push(r.sample);
      else {
        err = r.error;
        allErrors.push(r.error);
      }
    }
    return err;
  };

  const samples: Sample[] = [];
  let lastError = collect(await runBatch(SAMPLE_COUNT, 0), samples);
  console.info("[foot-scan] initial batch done", {
    requested: SAMPLE_COUNT,
    succeeded: samples.length,
    failed: SAMPLE_COUNT - samples.length
  });

  // Adaptive top-up: if the first reads disagree on the width ratio (the headline
  // metric), spend a few more reads to settle it — but only up to maxCount.
  if (samples.length >= 2 && samples.length < MAX_SAMPLES) {
    const ratios = samples.map((s) => s.modelRatio).filter((r): r is number => r !== null);
    const spread = ratios.length >= 2 ? Math.max(...ratios) - Math.min(...ratios) : 0;
    if (spread > FOOT_SCAN_CONFIG.sampling.expandRatioSpread) {
      const extra = MAX_SAMPLES - samples.length;
      console.info("[foot-scan] adaptive top-up triggered", { spread, extra, totalAfter: samples.length + extra });
      lastError = collect(await runBatch(extra, samples.length), samples) || lastError;
    }
  }

  if (!samples.length) {
    const detail = allErrors.length
      ? `All ${allErrors.length} read(s) failed. Errors: ${Array.from(new Set(allErrors)).join(" | ")}`
      : lastError || undefined;
    console.error("[foot-scan] all samples failed", {
      attempts: allErrors.length,
      model: VISION_MODEL,
      keyConfigured: Boolean(process.env.FOOT_SCAN_API_KEY?.trim()),
      uniqueErrorCount: new Set(allErrors).size
    });
    return { ok: false, error: "Analysis request failed.", detail };
  }

  const sizes = {
    top: parseImageSize(input.images.top),
    side: parseImageSize(input.images.side),
    other: input.images.top_other ? parseImageSize(input.images.top_other) : null
  };

  return { ok: true, result: aggregate(input, samples, sizes) };
}

// --- Aggregation across samples --------------------------------------------

type Sizes = { top: ImageSize | null; side: ImageSize | null; other: ImageSize | null };

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function modeOf<T extends string>(xs: T[]): T | null {
  if (!xs.length) return null;
  const counts = new Map<T, number>();
  let best = xs[0];
  let bestN = 0;
  for (const x of xs) {
    const n = (counts.get(x) ?? 0) + 1;
    counts.set(x, n);
    if (n > bestN) {
      best = x;
      bestN = n;
    }
  }
  return best;
}

function confWeight(c: Confidence): number {
  return c === "high" ? 3 : c === "medium" ? 2 : 1;
}

// How much a read should count toward a view's landmark consensus, from the
// model's own quality flag for that view. "ok" reads count fully; flagged ones
// still contribute but at a discount (they aren't thrown away).
function qualityWeight(q: string | null): number {
  if (q === "ok") return 1;
  if (q === null) return 0.8; // unreported — assume usable
  return 0.4; // blurry / cropped / wrong_view / too_dark
}

// Majority vote weighted by each sample's confidence, so a split breaks toward
// the most confident, not the first seen.
function weightedMode<T extends string>(items: { value: T; weight: number }[]): T | null {
  if (!items.length) return null;
  const totals = new Map<T, number>();
  let best = items[0].value;
  let bestW = -1;
  for (const { value, weight } of items) {
    const w = (totals.get(value) ?? 0) + weight;
    totals.set(value, w);
    if (w > bestW) {
      bestW = w;
      best = value;
    }
  }
  return best;
}

function fractionAgreeing<T>(xs: T[], chosen: T): number {
  if (!xs.length) return 0;
  return xs.filter((x) => x === chosen).length / xs.length;
}

function confFromFraction(frac: number): Confidence {
  if (frac >= 0.999) return "high";
  if (frac >= 0.6) return "medium";
  return "low";
}

// Confidence from how tightly the landmark reads agreed (normalized spread).
function confFromDispersion(disp: number): Confidence {
  if (disp < 0.02) return "high";
  if (disp < 0.05) return "medium";
  return "low";
}

const CONF_LEVELS: Confidence[] = ["low", "medium", "high"];
function stepConf(c: Confidence, delta: number): Confidence {
  const i = CONF_LEVELS.indexOf(c);
  return CONF_LEVELS[Math.min(2, Math.max(0, i + delta))];
}
function minConf(a: Confidence, b: Confidence): Confidence {
  return CONF_LEVELS.indexOf(a) <= CONF_LEVELS.indexOf(b) ? a : b;
}

// Residual front-back tilt for a view, or null when no sensor reading was given.
function tiltResidual(input: AnalyzeInput, view: ViewId): { beta: number; gamma: number } | null {
  const t = input.tilt?.[view];
  if (!t || typeof t.beta !== "number") return null;
  const target = FOOT_SCAN_CONFIG.imu.targetBeta[view] ?? 0;
  return { beta: t.beta - target, gamma: typeof t.gamma === "number" ? t.gamma : 0 };
}

function aggregate(input: AnalyzeInput, samples: Sample[], sizes: Sizes): FootScanResult {
  const lengthMm = input.footLengthMm;
  const single = samples.length === 1;
  const cfg = FOOT_SCAN_CONFIG;

  // Drop geometrically impossible top reads (ball behind heel, zero width, …)
  // so they can't drag the consensus; fall back to all reads if that empties it.
  const topUsable = sizes.top
    ? samples.filter((s) => !isDegenerateTop(s.top, sizes.top as ImageSize))
    : samples;
  const topPool = topUsable.length ? topUsable : samples;

  // Consensus landmark sets — weighted per-point median. Top landmarks are
  // weighted by the top view's quality × the read's width confidence; side
  // landmarks by the side view's quality.
  const topWeights = topPool.map((s) => qualityWeight(s.quality.top) * confWeight(s.modelWidthConf));
  const sideWeights = samples.map((s) => qualityWeight(s.quality.side));
  const topAgg = medianLandmarks(topPool.map((s) => s.top), topWeights);
  const sideAgg = medianLandmarks(samples.map((s) => s.side), sideWeights);

  // --- Width ----------------------------------------------------------------
  const modelRatios = samples.map((s) => s.modelRatio).filter((r): r is number => r !== null);
  const modelRatioMed = median(modelRatios);
  const lmRatioRaw = sizes.top ? ratioFromPoints(topAgg.points, sizes.top) : null;

  // De-tilt the landmark ratio with the IMU residual for the top shot. With a
  // camera FOV (native plugin, Channel A) use the exact homography; otherwise
  // the scalar cos approximation. sanitizeRatio below bounds the result, so a
  // bad FOV/sign can't produce an absurd ratio.
  const topTilt = tiltResidual(input, "top");
  const topFov = input.tilt?.top?.fovDeg;
  let lmRatio = lmRatioRaw;
  if (lmRatioRaw !== null && topTilt) {
    let rect: number | null = null;
    if (typeof topFov === "number" && sizes.top) {
      rect = rectifiedRatioWithFov(topAgg.points, sizes.top, topTilt.beta, topTilt.gamma, topFov);
    }
    lmRatio =
      rect !== null ? rect : correctRatioForTilt(lmRatioRaw, topTilt.beta, topTilt.gamma, cfg.imu.minCorrectionDeg);
  }

  const baseRatio = sanitizeRatio(lmRatio) ?? modelRatioMed;
  const usedLandmarkRatio = sanitizeRatio(lmRatio) !== null;

  // Cross-session fusion: blend this scan's width ratio with the user's recent
  // scans of the SAME foot (same side, ~same length). Repeated measurements of
  // an unchanging quantity, so a confidence-weighted mean shrinks variance.
  // History is discounted and the shift is clamped, so it can only nudge — never
  // override — a fresh read.
  const priorMatches = (input.priors ?? []).filter(
    (p) => p.primarySide === input.primarySide && p.widthRatio !== null && Math.abs(p.footLengthMm - lengthMm) <= 5
  );
  let ratio = baseRatio;
  let crossSessionAgreed = false;
  if (baseRatio !== null && priorMatches.length) {
    const w0 = confWeight(single ? samples[0].modelWidthConf : confFromDispersion(topAgg.dispersion));
    let num = w0 * baseRatio;
    let den = w0;
    for (const p of priorMatches) {
      const w = confWeight(p.widthConf) * 0.5;
      num += w * (p.widthRatio as number);
      den += w;
    }
    ratio = Math.max(baseRatio - 0.02, Math.min(baseRatio + 0.02, num / den));
    crossSessionAgreed = priorMatches.every((p) => Math.abs((p.widthRatio as number) - baseRatio) <= 0.03);
  }

  const widthMm = ratio !== null ? widthMmFromRatio(ratio, lengthMm) : null;
  const widthClass = ratio !== null ? widthClassFromRatio(ratio) : "standard";

  // Width confidence: grounded in landmark agreement, then docked for an
  // implausible ball position, a landmark/model disagreement, or a model-only
  // (no usable landmark) fallback; raised when history corroborates.
  let widthConf: Confidence;
  if (ratio === null) {
    widthConf = "low";
  } else if (single) {
    widthConf = samples[0].modelWidthConf;
  } else {
    widthConf = confFromDispersion(topAgg.dispersion);
    const ballT = sizes.top ? ballPositionFraction(topAgg.points, sizes.top) : null;
    if (ballT !== null && (ballT < cfg.plausibility.ballMinFromHeel || ballT > cfg.plausibility.ballMaxFromHeel)) {
      widthConf = stepConf(widthConf, -1);
    }
    if (usedLandmarkRatio && modelRatioMed !== null && Math.abs((lmRatio as number) - modelRatioMed) > 0.05) {
      widthConf = stepConf(widthConf, -1); // landmark vs model cross-check diverged
    }
    if (!usedLandmarkRatio) widthConf = minConf(widthConf, "medium"); // model-only fallback
  }
  if (crossSessionAgreed) widthConf = stepConf(widthConf, 1);

  // --- Hallux valgus (SCREENING) -------------------------------------------
  const halluxRatio = sizes.top ? halluxRatioFromPoints(topAgg.points, sizes.top) : null;
  let hallux: HalluxClass = "none";
  let halluxAngle: number | null = null;
  let halluxConf: Confidence = "low";
  const halluxReads = samples.filter((s) => s.top.mtp1 && s.top.hallux_tip).length;
  if (halluxRatio !== null && halluxReads >= Math.ceil(samples.length / 2)) {
    hallux = halluxClassFromRatio(halluxRatio);
    halluxAngle = halluxAngleFromRatio(halluxRatio);
    // A photo screen never earns more than medium confidence.
    halluxConf = minConf(single ? "medium" : confFromDispersion(topAgg.dispersion), "medium");
  }

  // --- Toe shape (model vote) ----------------------------------------------
  const toe =
    weightedMode(samples.map((s) => ({ value: s.toe, weight: confWeight(s.toeConf) }))) ?? "egyptian";
  const rep = pickRepresentative(samples, ratio);
  const toeConf: Confidence = single
    ? rep.toeConf
    : confFromFraction(fractionAgreeing(samples.map((s) => s.toe), toe));

  // --- Instep: AHI corroborates the model's two-view read ------------------
  const ahi = sizes.side ? ahiFromPoints(sideAgg.points, sizes.side) : null;
  const modelInstep =
    weightedMode(samples.map((s) => ({ value: s.instep, weight: confWeight(s.instepConf) }))) ?? "normal";
  const modelInstepConf: Confidence = single
    ? rep.instepConf
    : confFromFraction(fractionAgreeing(samples.map((s) => s.instep), modelInstep));

  let instep: InstepClass = modelInstep;
  let instepConf: Confidence = modelInstepConf;
  if (ahi !== null) {
    const ahiInstep = instepClassFromAhi(ahi);
    if (ahiInstep === modelInstep) {
      instepConf = stepConf(modelInstepConf, 1); // two methods agree → more sure
    } else {
      instep = modelInstep; // keep the two-view read, but flag the conflict
      instepConf = "low";
    }
  }

  // --- Re-take requests: quality flags (majority) + a gross IMU angle gate --
  const needs_retake: RetakeRequest[] = [];
  for (const view of ["top", "oblique", "side"] as const) {
    const flags = samples
      .map((s) => s.quality[view])
      .filter((q): q is string => typeof q === "string" && q !== "ok");
    let reason: string | null = flags.length > samples.length / 2 ? (modeOf(flags) ?? "blurry") : null;
    if (!reason) {
      const r = tiltResidual(input, view);
      if (r && (Math.abs(r.beta) > cfg.imu.betaGateTolerance || Math.abs(r.gamma) > cfg.imu.gammaGateTolerance)) {
        reason = "bad_angle";
      }
    }
    if (reason) needs_retake.push({ view, reason });
  }

  const result: FootScanResult = {
    primary: {
      side: input.primarySide,
      measurements: {
        foot_length_mm: lengthMm,
        foot_width_mm: widthMm,
        width_ratio: ratio,
        hallux_angle_deg: halluxAngle,
        ahi
      },
      traits: { width: widthClass, instep, toe_shape: toe, hallux },
      confidence: { width: widthConf, instep: instepConf, toe_shape: toeConf, hallux: halluxConf }
    },
    other: null,
    asymmetry: null,
    needs_retake,
    summary: rep.summary.slice(0, 600),
    cautions: rep.cautions.slice(0, 4)
  };

  // --- Other foot + asymmetry (only when its photo was supplied + read) -----
  if (input.images.top_other) {
    const others = samples
      .map((s) => s.other)
      .filter((o): o is NonNullable<Sample["other"]> => o !== null);
    if (others.length) {
      const oFlags = others
        .map((o) => o.quality)
        .filter((q): q is string => typeof q === "string" && q !== "ok");
      if (oFlags.length > others.length / 2) {
        needs_retake.push({ view: "top_other", reason: modeOf(oFlags) ?? "blurry" });
      }
      const lvp = median(others.map((o) => o.lengthVsPrimary)) ?? 1;
      const otherLen = Math.round(lengthMm * lvp);
      const otherAgg = medianLandmarks(others.map((o) => o.landmarks));
      const otherRatio = sizes.other ? sanitizeRatio(ratioFromPoints(otherAgg.points, sizes.other)) : null;
      const otherWidth = otherRatio !== null ? widthMmFromRatio(otherRatio, otherLen) : null;
      const side = otherSide(input.primarySide);
      result.other = {
        side,
        measurements: {
          foot_length_mm: otherLen,
          foot_width_mm: otherWidth,
          width_ratio: otherRatio,
          hallux_angle_deg: null,
          ahi: null
        }
      };
      result.asymmetry = {
        length_diff_mm: Math.abs(lengthMm - otherLen),
        width_diff_mm: widthMm !== null && otherWidth !== null ? Math.abs(widthMm - otherWidth) : 0,
        larger: otherLen > lengthMm ? side : input.primarySide
      };
      // Left/right corroboration: feet are usually near-symmetric, so an agreeing
      // other-foot width raises confidence. We never average the two (different
      // feet) — this only nudges the confidence.
      if (otherRatio !== null && ratio !== null && Math.abs(otherRatio - ratio) <= 0.03) {
        result.primary.confidence.width = stepConf(result.primary.confidence.width, 1);
      }
    }
  }

  // Gentle, non-clinical nudge when the bunion screen reads notable.
  if (hallux === "moderate_plus" && halluxConf !== "low") {
    result.cautions.push(
      input.locale === "zh"
        ? "拇趾向外偏斜较明显（仅为照片外观筛查）。如有不适，建议咨询足科医生。"
        : "The big toe leans outward noticeably (photo-based screening only). If it bothers you, consider seeing a podiatrist."
    );
  }

  // Always append the standing disclaimer (in the UI language).
  result.cautions.push(
    input.locale === "zh"
      ? "本结果由照片估算，仅供选鞋参考，非医疗诊断。"
      : "Photo-based estimate for shoe-fitting reference only — not a medical assessment."
  );
  return result;
}

// Representative sample: the read whose width ratio is nearest the final ratio
// (falls back to the first). Its prose + reported confidences stand in for the
// group where a single-sample value is still needed.
function pickRepresentative(samples: Sample[], ratio: number | null): Sample {
  if (ratio === null) return samples[0];
  let best = samples[0];
  let bestD = Infinity;
  for (const s of samples) {
    if (s.modelRatio === null) continue;
    const d = Math.abs(s.modelRatio - ratio);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}
