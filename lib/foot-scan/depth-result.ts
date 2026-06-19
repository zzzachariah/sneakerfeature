// Turn a depth-scan point cloud into a FootScanResult, reusing the photo
// pipeline's classification so the result renders in the same UI.
//
// Depth measures real millimetres + ball girth + instep height directly; it does
// NOT (in this Beta) read toe shape or hallux, so those come back low-confidence
// defaults with a caution.

import { measureFootCloud, type Vec3 } from "@/lib/foot-scan/depth";
import { widthClassFromRatio, instepClassFromAhi } from "@/lib/foot-scan/classify";
import type { FootScanResult, FootSide } from "@/lib/foot-scan/types";

export function depthResultFromCloud(
  points: Vec3[],
  side: FootSide,
  unitToMm: number,
  locale?: string
): FootScanResult | null {
  const m = measureFootCloud(points, { unitToMm });
  if (!m || m.foot_length_mm <= 0) return null;

  const ratio = m.foot_width_mm / m.foot_length_mm;
  // AHI proxy: instep height over foot length (full, not truncated — close enough
  // to refine the band; the height itself is a true measurement).
  const ahi = m.instep_height_mm / m.foot_length_mm;
  const zh = locale === "zh";

  return {
    primary: {
      side,
      measurements: {
        foot_length_mm: m.foot_length_mm,
        foot_width_mm: m.foot_width_mm,
        width_ratio: ratio,
        hallux_angle_deg: null,
        ahi,
        ball_girth_mm: m.ball_girth_mm,
        instep_height_mm: m.instep_height_mm,
        source: "depth"
      },
      traits: {
        width: widthClassFromRatio(ratio),
        instep: instepClassFromAhi(ahi),
        toe_shape: "egyptian",
        hallux: "none"
      },
      // Measured dimensions are high-confidence; toe/hallux aren't read from depth.
      confidence: { width: "high", instep: "high", toe_shape: "low", hallux: "low" }
    },
    other: null,
    asymmetry: null,
    needs_retake: [],
    summary: zh
      ? "高精度深度测量：脚长、脚宽、脚背高与跖围为实测值。"
      : "High-precision depth measurement: length, width, instep height and ball girth are measured directly.",
    cautions: [
      zh
        ? "深度测量（Beta）暂不含趾型与拇外翻评估。"
        : "Depth measurement (Beta) does not yet assess toe shape or hallux.",
      zh
        ? "本结果仅供选鞋参考，非医疗诊断。"
        : "Photo-based estimate for shoe-fitting reference only — not a medical assessment."
    ]
  };
}
