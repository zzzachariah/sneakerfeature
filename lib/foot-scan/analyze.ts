// Server-side foot-shape analysis.
//
// v1 uses the vision model (Claude via the packyapi relay) to read the guided
// photos: it reports the width/length ratio, toe shape and instep, plus a
// per-view quality check so the client can ask for a targeted re-shoot. The
// width *classification* and the millimetre conversion are done here in code
// (see classify.ts) so the boundaries stay explicit and tunable.
//
// The heavier accuracy upgrades from the plan — a real CV segmentation +
// homography pipeline for the geometry, and validation-set calibration — slot
// in behind this same interface later.

import type OpenAI from "openai";
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
import {
  isToeShape,
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

// A stronger vision model markedly helps the fine visual calls; allow an
// override but fall back to the catalog model so it works out of the box.
const VISION_MODEL =
  process.env.FOOT_SCAN_MODEL?.trim() ||
  process.env.PACKYAPI_VISION_MODEL?.trim() ||
  process.env.PACKY_API_VISION_MODEL?.trim() ||
  PACKY_MODEL;

export type AnalyzeInput = {
  // The chosen/primary foot we run the full 3-view analysis on.
  primarySide: FootSide;
  footLengthMm: number;
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

const PROMPT = `You are a footwear-fitting assistant analysing guided photos of ONE person's feet to estimate basic foot shape. You are NOT making a medical diagnosis.

You receive labelled images. For each, first judge whether it is usable. The person may be wearing thin socks — that is acceptable; still estimate the traits. Only if thick socks blur the foot's outline or hide the toe boundaries, lower the affected confidence (and set toe_confidence to "low" when individual toes can't be told apart).

Then read these traits from the PRIMARY foot:
1. width_ratio — the foot's maximum width divided by its heel-to-longest-toe length, estimated from the TOP-DOWN photo. A normal foot is around 0.38-0.40; narrow ~0.34-0.37; wide ~0.42-0.46. Give a single decimal number.
2. toe_shape — one of: "egyptian" (big toe longest, toes slope down), "greek" (second toe longest), "roman" (first 2-3 toes about even), "square" (all toes about even). From the TOP-DOWN photo.
3. instep — overall height/volume of the top of the foot (the dorsum/midfoot): "low", "normal", or "high". Read it from the SIDE and 45° OBLIQUE photos together (side = height silhouette, oblique = how much it domes).

For each trait also give a confidence: "low", "medium" or "high" — be honest; if a needed view is poor, say low.

If an OTHER-foot top-down photo is provided, also estimate that foot's width_ratio and length_vs_primary (its length divided by the primary foot's length, typically 0.95-1.05).

Reply with STRICT JSON only, no markdown, no commentary:
{
  "primary": {
    "view_quality": { "top": "ok|blurry|cropped|wrong_view|too_dark", "oblique": "ok|blurry|cropped|wrong_view|too_dark", "side": "ok|blurry|cropped|wrong_view|too_dark" },
    "width_ratio": 0.39,
    "width_confidence": "low|medium|high",
    "toe_shape": "egyptian|greek|roman|square",
    "toe_confidence": "low|medium|high",
    "instep": "low|normal|high",
    "instep_confidence": "low|medium|high"
  },
  "other": { "view_quality": { "top_other": "ok|blurry|cropped|wrong_view|too_dark" }, "width_ratio": 0.39, "length_vs_primary": 1.0 },
  "summary": "one short, friendly paragraph describing the foot shape in plain language",
  "cautions": ["short caveats, e.g. lighting/angle limits"]
}
Set "other" to null if no other-foot photo was given. Keep summary and cautions in English (the app localises them).`;

export async function analyzeFootScan(input: AnalyzeInput): Promise<AnalyzeOutcome> {
  const client = createPackyClient();
  if (!client) {
    return { ok: false, error: "AI service is not configured.", detail: describePackyEnvProblem(getPackyEnvReport()) };
  }

  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    { type: "text", text: PROMPT },
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

  let raw: string;
  try {
    const completion = await client.chat.completions.create({
      model: VISION_MODEL,
      temperature: 0,
      max_tokens: 900,
      // The relay does not lift an OpenAI `system` turn into Anthropic's system
      // field, so everything rides in a single user turn (same pattern as the
      // recommender).
      messages: [{ role: "user", content }]
    });
    raw = completion.choices[0]?.message?.content ?? "";
  } catch (e) {
    return { ok: false, error: "Analysis request failed.", detail: describePackyError(e) };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripFences(raw)) as Record<string, unknown>;
  } catch {
    return { ok: false, error: "Could not read the analysis result.", detail: raw.slice(0, 300) };
  }

  return { ok: true, result: buildResult(input, parsed) };
}

function buildResult(input: AnalyzeInput, parsed: Record<string, unknown>): FootScanResult {
  const primary = (parsed.primary ?? {}) as Record<string, unknown>;
  const other = parsed.other as Record<string, unknown> | null | undefined;

  const needs_retake: RetakeRequest[] = [];
  const pq = (primary.view_quality ?? {}) as Record<string, unknown>;
  for (const view of ["top", "oblique", "side"] as ViewId[]) {
    const q = pq[view];
    if (typeof q === "string" && q !== "ok") {
      needs_retake.push({ view, reason: q });
    }
  }

  // Primary geometry.
  const lengthMm = input.footLengthMm;
  const ratio = sanitizeRatio(primary.width_ratio);
  const widthMm = ratio !== null ? widthMmFromRatio(ratio, lengthMm) : null;
  const widthClass = ratio !== null ? widthClassFromRatio(ratio) : "standard";

  const result: FootScanResult = {
    primary: {
      side: input.primarySide,
      measurements: {
        foot_length_mm: lengthMm,
        foot_width_mm: widthMm,
        width_ratio: ratio
      },
      traits: {
        width: widthClass,
        instep: asInstep(primary.instep),
        toe_shape: asToe(primary.toe_shape)
      },
      confidence: {
        width: ratio !== null ? asConfidence(primary.width_confidence) : "low",
        instep: asConfidence(primary.instep_confidence),
        toe_shape: asConfidence(primary.toe_confidence)
      }
    },
    other: null,
    asymmetry: null,
    // Same array reference is mutated by the other-foot block below.
    needs_retake,
    summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 600) : "",
    cautions: Array.isArray(parsed.cautions)
      ? parsed.cautions.filter((c): c is string => typeof c === "string").slice(0, 4)
      : []
  };

  // Other foot + asymmetry (only when its photo was supplied and read).
  if (input.images.top_other && other) {
    const oq = (other.view_quality ?? {}) as Record<string, unknown>;
    if (typeof oq.top_other === "string" && oq.top_other !== "ok") {
      needs_retake.push({ view: "top_other", reason: oq.top_other });
    }
    const lenRatioRaw = other.length_vs_primary;
    const lenRatio =
      typeof lenRatioRaw === "number" && lenRatioRaw > 0.8 && lenRatioRaw < 1.2 ? lenRatioRaw : 1;
    const otherLen = Math.round(lengthMm * lenRatio);
    const otherRatio = sanitizeRatio(other.width_ratio);
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

  // Always append the standing disclaimer.
  result.cautions.push("Photo-based estimate for shoe-fitting reference only — not a medical assessment.");
  return result;
}
