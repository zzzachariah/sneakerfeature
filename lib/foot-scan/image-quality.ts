// Client-side image quality checks for the capture screen.
//
// Two jobs, both on the device before anything is uploaded (no server round
// trip, instant feedback):
//   1. Pick the sharpest frame of a short live-capture burst.
//   2. Gate a captured shot for blur / bad exposure and nudge a re-take.
//
// The sharpness metric is the variance of the Laplacian on the luma plane — the
// standard, cheap "is this in focus?" signal. Exposure is the fraction of
// near-black / near-white pixels. Both run on a small downscaled canvas so they
// are effectively free. These are SOFT signals: the UI warns and offers a
// re-take, it never hard-blocks (the heuristic can be wrong).

import { FOOT_SCAN_CONFIG } from "@/lib/foot-scan/config";

export type QualityIssue = "blurry" | "too_dark" | "too_bright";

// Variance of the 4-neighbour Laplacian over the luma plane. Higher = sharper.
export function lumaLaplacianVariance(data: Uint8ClampedArray, w: number, h: number): number {
  if (w < 3 || h < 3) return Number.POSITIVE_INFINITY;
  const luma = new Float32Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    luma[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      const lap = luma[c - 1] + luma[c + 1] + luma[c - w] + luma[c + w] - 4 * luma[c];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return Number.POSITIVE_INFINITY;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

// Fraction of near-black and near-white pixels (by luma).
export function exposureFractions(
  data: Uint8ClampedArray,
  darkLevel: number,
  brightLevel: number
): { darkFraction: number; brightFraction: number } {
  let dark = 0;
  let bright = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const l = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (l <= darkLevel) dark++;
    else if (l >= brightLevel) bright++;
    n++;
  }
  if (n === 0) return { darkFraction: 0, brightFraction: 0 };
  return { darkFraction: dark / n, brightFraction: bright / n };
}

// Turn raw pixel metrics into a single issue (or null = looks fine). Blur is
// checked first since a blurry frame poisons the landmark read the most.
export function issueFromMetrics(blurVar: number, darkFraction: number, brightFraction: number): QualityIssue | null {
  const q = FOOT_SCAN_CONFIG.quality;
  if (brightFraction > q.brightFractionMax) return "too_bright";
  if (darkFraction > q.darkFractionMax) return "too_dark";
  if (blurVar < q.blurVarianceMin) return "blurry";
  return null;
}

// Draw any source onto a small scratch canvas and read its pixels back.
function pixelsFrom(source: CanvasImageSource, sw: number, sh: number): Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(source, 0, 0, sw, sh);
    return ctx.getImageData(0, 0, sw, sh).data;
  } catch {
    return null; // tainted canvas / decode race — treat as "no signal"
  }
}

const SCORE_DIM = 256;

function scoreDims(w: number, h: number): { sw: number; sh: number } {
  const scale = Math.min(1, SCORE_DIM / Math.max(w, h));
  return { sw: Math.max(3, Math.round(w * scale)), sh: Math.max(3, Math.round(h * scale)) };
}

// Sharpness score for one live video frame (variance of Laplacian). Used to pick
// the sharpest frame of a burst. Returns 0 when pixels can't be read.
export function frameSharpness(video: HTMLVideoElement): number {
  if (!video.videoWidth || !video.videoHeight) return 0;
  const { sw, sh } = scoreDims(video.videoWidth, video.videoHeight);
  const px = pixelsFrom(video, sw, sh);
  return px ? lumaLaplacianVariance(px, sw, sh) : 0;
}

// Assess a captured image (data URL) for blur / exposure. Resolves to an issue
// code or null. Never throws — quality checks must not break capture.
export function assessImageQuality(dataUrl: string): Promise<QualityIssue | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { sw, sh } = scoreDims(img.width, img.height);
      const px = pixelsFrom(img, sw, sh);
      if (!px) return resolve(null);
      const blur = lumaLaplacianVariance(px, sw, sh);
      const { darkFraction, brightFraction } = exposureFractions(
        px,
        FOOT_SCAN_CONFIG.quality.darkLevel,
        FOOT_SCAN_CONFIG.quality.brightLevel
      );
      resolve(issueFromMetrics(blur, darkFraction, brightFraction));
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}
