// Server-side foot-shape analysis.
//
// The vision model (Claude via the packyapi relay) reads the guided photos. Two
// accuracy levers live here on top of a plain single-pass read:
//
//  1. Landmark geometry. The model returns four normalized landmark points
//     (heel, longest toe, widest medial/lateral) and the width/length ratio is
//     computed deterministically in code (geometry.ts) — the model only has to
//     *point*, not eyeball a ratio. It still reports a width_ratio as a fallback.
//  2. Self-consistency. The model is run a few times in parallel and the results
//     are aggregated (median ratio, majority vote on the discrete traits), so a
//     single noisy read can't swing the result. Confidence is derived from how
//     much the runs agreed — a more honest signal than a single self-report.
//
// The width *classification* and the millimetre conversion stay in code
// (classify.ts) so the boundaries remain explicit and tunable.

import OpenAI from "openai";
import {
  createPackyClient,
  PACKY_MODEL,
  getPackyEnvReport,
  describePackyEnvProblem,
  describePackyError
} from "@/lib/ai/packy-client";
import {
  widthClassFromRatio,
  widthMmFromRatio,
  otherSide,
  sanitizeRatio
} from "@/lib/foot-scan/classify";
import { parseImageSize, ratioFromLandmarks, type ImageSize } from "@/lib/foot-scan/geometry";
import {
  isInstepClass,
  isConfidence,
  type Confidence,
  type FootScanResult,
  type FootSide,
  type InstepClass,
  type RetakeRequest,
  type ToeShape,
  type ViewId
} from "@/lib/foot-scan/types";
import { isToeShape } from "@/lib/foot-scan/types";

// A stronger vision model markedly helps the fine visual calls (toe boundaries,
// instep doming, landmark placement). Set FOOT_SCAN_MODEL to the exact model
// string your packyapi account exposes for a strong vision model (e.g. an Opus
// or Sonnet identifier — names vary by relay, so copy it from packyapi's model
// list). When unset we fall back to PACKY_MODEL, which already works out of the
// box, so leaving it unconfigured never breaks the feature.
const VISION_MODEL =
  process.env.FOOT_SCAN_MODEL?.trim() ||
  process.env.PACKYAPI_VISION_MODEL?.trim() ||
  process.env.PACKY_API_VISION_MODEL?.trim() ||
  PACKY_MODEL;

// How many times to read each scan and aggregate (1 = no self-consistency).
const SAMPLE_COUNT = (() => {
  const n = Number.parseInt(process.env.FOOT_SCAN_SAMPLES ?? "", 10);
  return Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3;
})();

// Sampling temperature used only when SAMPLE_COUNT > 1, to give the runs enough
// variety to average. If the model/relay rejects `temperature`, the call is
// retried without it (see runSample).
const SAMPLE_TEMPERATURE = (() => {
  const t = Number.parseFloat(process.env.FOOT_SCAN_TEMPERATURE ?? "");
  return Number.isFinite(t) && t >= 0 && t <= 1 ? t : 0.5;
})();

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

function stripFences(text: string): string {
  return text.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
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

const PROMPT = `You are a footwear-fitting assistant estimating basic foot shape from guided photos of ONE person's feet. This is NOT a medical diagnosis.

You receive labelled images. For each, first judge whether it is usable. Thin socks are acceptable — still estimate the traits. Only when thick socks blur the outline or hide the toe boundaries should you lower the affected confidence (and set toe_confidence to "low" when individual toes can't be separated).

Work in two steps for the PRIMARY foot, using the TOP-DOWN photo as the measurement reference.

STEP 1 — Locate four landmarks. Give each as a normalized [x, y] pair where x is the fraction of image WIDTH (0 = left edge, 1 = right edge) and y is the fraction of image HEIGHT (0 = top edge, 1 = bottom edge):
  - heel: the rear-most point of the heel.
  - toe: the tip of the LONGEST toe.
  - wide_medial: the widest point on the INNER edge (around the big-toe / first-metatarsal "ball").
  - wide_lateral: the widest point on the OUTER edge (around the little-toe / fifth-metatarsal).
Choose the true anatomical extremes even if the foot is rotated or tilted in the frame. If the foot is cut off or a point is unclear, still give your best estimate and lower width_confidence.

STEP 2 — Read these traits:
1. width_ratio — foot maximum width divided by heel-to-longest-toe length, as a single decimal. Estimate it INDEPENDENTLY of the landmarks (it is a cross-check). Guide: narrow ~0.34-0.37, normal ~0.38-0.40, wide ~0.42-0.46.
2. toe_shape — one of: "egyptian" (big toe longest, toes slope down), "greek" (second toe longest), "roman" (first 2-3 toes about even), "square" (all toes about even). From the TOP-DOWN photo.
3. instep — overall height/volume of the top of the foot (dorsum/midfoot): "low", "normal", or "high". Read the SIDE photo (height silhouette) and the 45° OBLIQUE photo (how much it domes) together.

For each trait give a confidence: "low", "medium" or "high" — be honest; if a needed view is poor, say low.

Ignore perspective and foreshortening: judge the foot's real proportions, not the apparent ones produced by camera angle.

If an OTHER-foot top-down photo is provided, also give its four landmarks (same coordinate system), its width_ratio, and length_vs_primary (its length divided by the primary foot's length, typically 0.95-1.05).

Reply with STRICT JSON only, no markdown, no commentary:
{
  "reasoning": "one or two short sentences on what you see and how you placed the landmarks",
  "primary": {
    "view_quality": { "top": "ok|blurry|cropped|wrong_view|too_dark", "oblique": "ok|blurry|cropped|wrong_view|too_dark", "side": "ok|blurry|cropped|wrong_view|too_dark" },
    "landmarks": { "heel": [0.5, 0.9], "toe": [0.5, 0.1], "wide_medial": [0.38, 0.42], "wide_lateral": [0.62, 0.46] },
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
Set "other" to null if no other-foot photo was given.`;

// --- One read of the scan --------------------------------------------------

type PrimaryQuality = Record<"top" | "oblique" | "side", string | null>;

type Sample = {
  quality: PrimaryQuality;
  ratio: number | null;
  widthConf: Confidence;
  toe: ToeShape;
  toeConf: Confidence;
  instep: InstepClass;
  instepConf: Confidence;
  summary: string;
  cautions: string[];
  other: { quality: string | null; ratio: number | null; lengthVsPrimary: number } | null;
};

type SampleResult = { ok: true; sample: Sample } | { ok: false; error: string };

async function runSample(
  client: OpenAI,
  content: OpenAI.Chat.Completions.ChatCompletionContentPart[],
  temperature: number,
  topSize: ImageSize | null,
  otherSize: ImageSize | null,
  hasOther: boolean
): Promise<SampleResult> {
  // The relay does not lift an OpenAI `system` turn into Anthropic's system
  // field, so everything rides in a single user turn.
  const base = {
    model: VISION_MODEL,
    max_tokens: 1500,
    messages: [{ role: "user" as const, content }]
  };

  let raw: string;
  try {
    let completion;
    try {
      completion = await client.chat.completions.create(
        temperature > 0 ? { ...base, temperature } : base
      );
    } catch (e) {
      // Stronger models (e.g. Opus 4.x) reject `temperature` on the native API;
      // some relays pass it straight through. Retry once without it so the model
      // upgrade can't break the feature — self-consistency then degrades to
      // (near-)deterministic samples rather than failing.
      if (temperature > 0 && e instanceof OpenAI.APIError && e.status === 400) {
        completion = await client.chat.completions.create(base);
      } else {
        throw e;
      }
    }
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (e) {
    return { ok: false, error: describePackyError(e) };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripFences(raw)) as Record<string, unknown>;
  } catch {
    return { ok: false, error: raw.slice(0, 300) };
  }

  const primary = (parsed.primary ?? {}) as Record<string, unknown>;
  const pq = (primary.view_quality ?? {}) as Record<string, unknown>;
  const quality: PrimaryQuality = {
    top: typeof pq.top === "string" ? pq.top : null,
    oblique: typeof pq.oblique === "string" ? pq.oblique : null,
    side: typeof pq.side === "string" ? pq.side : null
  };

  // Prefer the code-computed ratio from landmarks; fall back to the model's
  // own width_ratio estimate when landmarks/image-size are unusable.
  const ratio =
    sanitizeRatio(ratioFromLandmarks(primary.landmarks, topSize)) ?? sanitizeRatio(primary.width_ratio);

  let other: Sample["other"] = null;
  if (hasOther) {
    const o = (parsed.other ?? null) as Record<string, unknown> | null;
    if (o) {
      const oq = (o.view_quality ?? {}) as Record<string, unknown>;
      const oRatio =
        sanitizeRatio(ratioFromLandmarks(o.landmarks, otherSize)) ?? sanitizeRatio(o.width_ratio);
      const lvpRaw = o.length_vs_primary;
      const lvp =
        typeof lvpRaw === "number" && lvpRaw > 0.8 && lvpRaw < 1.2 ? lvpRaw : 1;
      other = {
        quality: typeof oq.top_other === "string" ? oq.top_other : null,
        ratio: oRatio,
        lengthVsPrimary: lvp
      };
    }
  }

  return {
    ok: true,
    sample: {
      quality,
      ratio,
      widthConf: ratio !== null ? asConfidence(primary.width_confidence) : "low",
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
  const client = createPackyClient();
  if (!client) {
    return {
      ok: false,
      error: "AI service is not configured.",
      detail: describePackyEnvProblem(getPackyEnvReport())
    };
  }

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

  // Image dimensions are needed once to un-normalize the landmark coordinates.
  const topSize = parseImageSize(input.images.top);
  const otherSize = input.images.top_other ? parseImageSize(input.images.top_other) : null;
  const hasOther = Boolean(input.images.top_other);

  // Self-consistency: read the scan a few times and aggregate. Runs go out in
  // parallel, so wall-clock stays ~one call — only token cost scales.
  const temperature = SAMPLE_COUNT > 1 ? SAMPLE_TEMPERATURE : 0;
  const results = await Promise.all(
    Array.from({ length: SAMPLE_COUNT }, () =>
      runSample(client, content, temperature, topSize, otherSize, hasOther)
    )
  );

  const samples: Sample[] = [];
  let lastError = "";
  for (const r of results) {
    if (r.ok) samples.push(r.sample);
    else lastError = r.error;
  }

  if (!samples.length) {
    return { ok: false, error: "Analysis request failed.", detail: lastError || undefined };
  }

  return { ok: true, result: aggregate(input, samples) };
}

// --- Aggregation across samples --------------------------------------------

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

function fractionAgreeing<T>(xs: T[], chosen: T): number {
  if (!xs.length) return 0;
  return xs.filter((x) => x === chosen).length / xs.length;
}

function confFromFraction(frac: number): Confidence {
  if (frac >= 0.999) return "high";
  if (frac >= 0.6) return "medium";
  return "low";
}

function widthConfFromSpread(ratios: number[]): Confidence {
  const spread = Math.max(...ratios) - Math.min(...ratios);
  if (spread < 0.03) return "high";
  if (spread < 0.06) return "medium";
  return "low";
}

function pickRepresentative(samples: Sample[], ratio: number | null): Sample {
  if (ratio === null) return samples[0];
  let best = samples[0];
  let bestD = Infinity;
  for (const s of samples) {
    if (s.ratio === null) continue;
    const d = Math.abs(s.ratio - ratio);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function aggregate(input: AnalyzeInput, samples: Sample[]): FootScanResult {
  const lengthMm = input.footLengthMm;
  const single = samples.length === 1;

  const ratios = samples.map((s) => s.ratio).filter((r): r is number => r !== null);
  const ratio = median(ratios);
  const widthMm = ratio !== null ? widthMmFromRatio(ratio, lengthMm) : null;
  const widthClass = ratio !== null ? widthClassFromRatio(ratio) : "standard";

  const toe = modeOf(samples.map((s) => s.toe)) ?? "egyptian";
  const instep = modeOf(samples.map((s) => s.instep)) ?? "normal";

  // Representative sample: the read whose ratio is nearest the median (falls
  // back to the first). Its prose + reported confidences stand in for the group.
  const rep = pickRepresentative(samples, ratio);

  // With one sample, trust the model's self-reported confidence; with several,
  // derive confidence from how much the runs agreed (a more honest signal).
  const widthConf: Confidence =
    ratio === null ? "low" : single ? rep.widthConf : widthConfFromSpread(ratios);
  const toeConf: Confidence = single
    ? rep.toeConf
    : confFromFraction(fractionAgreeing(samples.map((s) => s.toe), toe));
  const instepConf: Confidence = single
    ? rep.instepConf
    : confFromFraction(fractionAgreeing(samples.map((s) => s.instep), instep));

  // A view needs a re-shoot only if a majority of the reads flagged it.
  const needs_retake: RetakeRequest[] = [];
  for (const view of ["top", "oblique", "side"] as const) {
    const flags = samples
      .map((s) => s.quality[view])
      .filter((q): q is string => typeof q === "string" && q !== "ok");
    if (flags.length > samples.length / 2) {
      needs_retake.push({ view, reason: modeOf(flags) ?? "blurry" });
    }
  }

  const result: FootScanResult = {
    primary: {
      side: input.primarySide,
      measurements: { foot_length_mm: lengthMm, foot_width_mm: widthMm, width_ratio: ratio },
      traits: { width: widthClass, instep, toe_shape: toe },
      confidence: { width: widthConf, instep: instepConf, toe_shape: toeConf }
    },
    other: null,
    asymmetry: null,
    needs_retake,
    summary: rep.summary.slice(0, 600),
    cautions: rep.cautions.slice(0, 4)
  };

  // Other foot + asymmetry (only when its photo was supplied and read).
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
      const otherRatio = median(others.map((o) => o.ratio).filter((r): r is number => r !== null));
      const otherWidth = otherRatio !== null ? widthMmFromRatio(otherRatio, otherLen) : null;
      const side = otherSide(input.primarySide);
      result.other = {
        side,
        measurements: { foot_length_mm: otherLen, foot_width_mm: otherWidth, width_ratio: otherRatio }
      };
      result.asymmetry = {
        length_diff_mm: Math.abs(lengthMm - otherLen),
        width_diff_mm: widthMm !== null && otherWidth !== null ? Math.abs(widthMm - otherWidth) : 0,
        larger: otherLen > lengthMm ? side : input.primarySide
      };
    }
  }

  // Always append the standing disclaimer (in the UI language).
  result.cautions.push(
    input.locale === "zh"
      ? "本结果由照片估算，仅供选鞋参考，非医疗诊断。"
      : "Photo-based estimate for shoe-fitting reference only — not a medical assessment."
  );
  return result;
}
