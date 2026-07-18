// Deep foot report (Max-only) — turns a member's stored foot profile into
// concrete shopping guidance. Pure + deterministic (no AI, no I/O) so it runs on
// server or client and is trivially testable. The React card renders bilingual
// copy from these flags; here we only classify.

import type { FootProfile } from "@/lib/foot-scan/types";

export type FootReport = {
  profile: FootProfile;
  /** Benefits from wide-fitting brands / 2E widths. */
  runsWide: boolean;
  /** Standard lasts fit best; wide brands may need cinching. */
  runsNarrow: boolean;
  /** High instep — needs volume / adjustable lacing. */
  highVolume: boolean;
  /** Low instep — locks down better in low-volume uppers. */
  lowVolume: boolean;
  /** Egyptian / Greek toe — size for the longest toe. */
  sizeForToe: boolean;
  /** Square toe — prefers a squared / roomy toebox. */
  squareToe: boolean;
  /** Bunion-appearance band — prefers a soft, roomy forefoot. */
  bunionCare: boolean;
};

export function buildFootReport(p: FootProfile): FootReport {
  return {
    profile: p,
    runsWide: p.foot_width === "wide" || p.foot_width === "extra_wide",
    runsNarrow: p.foot_width === "narrow",
    highVolume: p.instep === "high",
    lowVolume: p.instep === "low",
    sizeForToe: p.toe_shape === "egyptian" || p.toe_shape === "greek",
    squareToe: p.toe_shape === "square",
    bunionCare: p.hallux === "moderate_plus"
  };
}
