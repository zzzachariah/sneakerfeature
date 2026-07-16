// Smart sizing advisor (premium). Turns per-shoe fit data + a member's foot scan
// into a concrete "buy US X.5, this pair runs half a size small and is narrow"
// recommendation. Pure + deterministic so it runs on server or client.

import { usSizeFromFootLengthMm, usSizeToEu } from "@/lib/foot-scan/size-chart";
import type { WidthClass, InstepClass, HalluxClass } from "@/lib/foot-scan/types";

export type LengthBias = "runs_small" | "true_to_size" | "runs_large";
export type WidthFit = "narrow" | "standard" | "wide";
export type Volume = "low" | "medium" | "high";
export type FitConfidence = "low" | "medium" | "high";

// Mirrors the shoe_fit table.
export type ShoeFit = {
  length_bias: LengthBias;
  adjust_half_sizes: number;
  width_fit: WidthFit;
  volume: Volume;
  notes: string | null;
  notes_zh: string | null;
  confidence: FitConfidence;
  source: "admin" | "ai" | "community";
};

export type FootInput = {
  footLengthMm: number;
  width?: WidthClass | null;
  instep?: InstepClass | null;
  hallux?: HalluxClass | null;
};

export type WidthVerdictLevel = "roomy" | "good" | "snug" | "caution";

export type SizeAdvice = {
  recommendedUs: number;
  recommendedEu: number;
  trueToSizeUs: number;
  offsetHalfSizes: number; // signed: + = size up
  lengthBias: LengthBias;
  width: { level: WidthVerdictLevel; text: string };
  confidence: FitConfidence;
  /** true when backed by per-shoe data; false = coarse brand-level estimate. */
  precise: boolean;
  notes: string[];
};

// Coarse default when a shoe has no per-shoe fit row yet — honest low-confidence
// brand-level estimate so a member still gets *something*, clearly labelled.
export function brandHeuristicFit(): ShoeFit {
  return {
    length_bias: "true_to_size",
    adjust_half_sizes: 0,
    width_fit: "standard",
    volume: "medium",
    notes: null,
    notes_zh: null,
    confidence: "low",
    source: "community"
  };
}

const WIDTH_RANK: Record<WidthClass, number> = { narrow: -1, standard: 0, wide: 1, extra_wide: 2 };
const SHOE_WIDTH_RANK: Record<WidthFit, number> = { narrow: -1, standard: 0, wide: 1 };

function signedOffsetHalfSizes(fit: ShoeFit): number {
  if (fit.length_bias === "runs_small") return fit.adjust_half_sizes; // go UP
  if (fit.length_bias === "runs_large") return -fit.adjust_half_sizes; // go DOWN
  return 0;
}

export function computeSizeAdvice(fit: ShoeFit | null, foot: FootInput): SizeAdvice {
  const f = fit ?? brandHeuristicFit();
  const precise = fit != null && fit.source !== "community";

  const trueToSize = usSizeFromFootLengthMm(foot.footLengthMm);
  const offsetHalf = signedOffsetHalfSizes(f);
  const recommendedUs = Math.round((trueToSize + offsetHalf * 0.5) * 2) / 2;

  // Width verdict: compare the foot's width class to the shoe's last.
  const notes: string[] = [];
  let level: WidthVerdictLevel = "good";
  let widthText = "楦型与你的脚宽匹配良好。";
  if (foot.width) {
    const diff = WIDTH_RANK[foot.width] - SHOE_WIDTH_RANK[f.width_fit];
    if (diff <= -1) {
      level = "roomy";
      widthText = "这双偏宽、你的脚偏窄 —— 内部可能偏松，建议系紧或搭厚袜提升包裹。";
    } else if (diff === 0) {
      level = "good";
      widthText = "楦型与你的脚宽匹配良好。";
    } else if (diff === 1) {
      level = "snug";
      widthText = "你的脚略宽于这双的楦型 —— 前掌会偏紧，介意包裹感可考虑大半码。";
    } else {
      level = "caution";
      widthText = "你的脚明显宽于这双的楦型 —— 建议大半到一码，或优先选择宽楦替代款。";
    }
  }

  // Length bias note.
  if (f.length_bias === "runs_small") {
    notes.push(`这双偏小${f.adjust_half_sizes >= 2 ? "约一码" : "约半码"}，已在建议尺码中补偿。`);
  } else if (f.length_bias === "runs_large") {
    notes.push(`这双偏大${f.adjust_half_sizes >= 2 ? "约一码" : "约半码"}，已在建议尺码中补偿。`);
  } else {
    notes.push("这双长度标准（true to size）。");
  }

  // Volume vs instep.
  if (foot.instep === "high" && f.volume === "low") {
    notes.push("鞋内空间偏浅、你脚背偏高 —— 系带别过紧，或考虑鞋带调整/大半码。");
  } else if (foot.instep === "low" && f.volume === "high") {
    notes.push("鞋内空间偏深、你脚背偏低 —— 可能需要系紧或加鞋垫来提升锁定。");
  }

  // Bunion screening + narrow last.
  if (foot.hallux === "moderate_plus" && f.width_fit === "narrow") {
    notes.push("你有较明显的拇趾外翻迹象，而这双楦型偏窄 —— 内侧第一跖趾关节可能受压，优先宽楦或柔软可延展鞋面。");
  }

  if (f.notes_zh && f.notes_zh.trim()) notes.push(f.notes_zh.trim());

  return {
    recommendedUs,
    recommendedEu: usSizeToEu(recommendedUs),
    trueToSizeUs: trueToSize,
    offsetHalfSizes: offsetHalf,
    lengthBias: f.length_bias,
    width: { level, text: widthText },
    confidence: precise ? f.confidence : "low",
    precise,
    notes
  };
}
