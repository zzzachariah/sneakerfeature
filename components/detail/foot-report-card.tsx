"use client";

// Max-only "deep foot report" rendered on the shoe page beneath the size advisor.
// Reads a computed FootReport (pure classification) and turns it into concrete,
// bilingual shopping guidance — brand-fit tendencies and shopping tips derived
// from the member's own foot shape. No AI: everything here is deterministic.

import { Footprints, Crown } from "lucide-react";
import type { FootReport } from "@/lib/foot-scan/foot-report";
import type { WidthClass, InstepClass, ToeShape } from "@/lib/foot-scan/types";
import { useLocale } from "@/components/i18n/locale-provider";

const WIDTH_ZH: Record<WidthClass, string> = { narrow: "偏窄", standard: "标准", wide: "偏宽", extra_wide: "超宽" };
const WIDTH_EN: Record<WidthClass, string> = { narrow: "Narrow", standard: "Standard", wide: "Wide", extra_wide: "Extra-wide" };
const INSTEP_ZH: Record<InstepClass, string> = { low: "低脚背", normal: "标准脚背", high: "高脚背" };
const INSTEP_EN: Record<InstepClass, string> = { low: "Low instep", normal: "Normal instep", high: "High instep" };
const TOE_ZH: Record<ToeShape, string> = { egyptian: "埃及脚型", greek: "希腊脚型", roman: "罗马脚型", square: "方形脚型" };
const TOE_EN: Record<ToeShape, string> = { egyptian: "Egyptian", greek: "Greek", roman: "Roman", square: "Square" };

export function FootReportCard({ report }: { report: FootReport }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const p = report.profile;

  const chips = [
    zh ? WIDTH_ZH[p.foot_width] : WIDTH_EN[p.foot_width],
    zh ? INSTEP_ZH[p.instep] : INSTEP_EN[p.instep],
    `${zh ? TOE_ZH[p.toe_shape] : TOE_EN[p.toe_shape]}${zh ? "" : " toe"}`
  ];

  // Brand-fit tendencies + shopping tips, only the ones that apply.
  const points: string[] = [];
  if (report.runsWide)
    points.push(
      zh
        ? "偏宽的脚：优先楦型宽松的品牌（New Balance、部分 Nike 宽楦、李宁䨻宽版），或同款的 2E 宽版。"
        : "Wide foot: favor wide-lasted brands (New Balance, some Nike wide lasts) or the 2E version of a shoe."
    );
  if (report.runsNarrow)
    points.push(
      zh
        ? "偏窄的脚：多数篮球鞋的标准楦更贴合；宽楦品牌建议系紧鞋带或加一层鞋垫。"
        : "Narrow foot: standard basketball lasts fit best; on wide brands, cinch the laces or add an insole."
    );
  if (report.highVolume)
    points.push(
      zh
        ? "高脚背：避免低容积、贴地鞋面，选可调节鞋带或中高帮支撑，脚背才不压迫。"
        : "High instep: avoid low-volume uppers; pick adjustable lacing or mid/high support so the top doesn't dig in."
    );
  if (report.lowVolume)
    points.push(
      zh
        ? "低脚背：贴地、低容积鞋面更跟脚；容积大的鞋建议锁紧鞋带避免松动。"
        : "Low instep: low-volume uppers lock you in better; on roomy shoes, lace-lock to stop slipping."
    );
  if (report.sizeForToe)
    points.push(
      zh
        ? "脚趾偏长（希腊/埃及型）：按最长的那根脚趾留空间，必要时上半码，避免顶脚趾。"
        : "Long toe (Greek/Egyptian): size for your longest toe — go up a half if needed so it doesn't jam the toebox."
    );
  if (report.squareToe)
    points.push(
      zh
        ? "方形脚趾：优先方正 / 宽头楦，避开尖头款，前掌才不夹。"
        : "Square toe: prefer a squared / roomy toebox and avoid pointed shapes so the forefoot isn't pinched."
    );
  if (report.bunionCare)
    points.push(
      zh
        ? "拇指外翻倾向：选前掌宽松、鞋面柔软的款，避开硬质叠层压在内侧。"
        : "Bunion tendency: choose a roomy, soft forefoot and avoid stiff overlays pressing the inner edge."
    );
  if (points.length === 0)
    points.push(
      zh
        ? "你的脚型比较均衡，大多数品牌的标准楦都合脚——按建议尺码买即可。"
        : "Your foot is well-balanced — most standard lasts fit you; just buy the recommended size."
    );

  return (
    <section className="mx-auto mt-4 w-full max-w-3xl px-4 sm:px-6">
      <div className="overflow-hidden rounded-2xl border p-5 sm:p-6" style={{ borderColor: "rgb(var(--gold-line) / 0.32)", background: "rgb(var(--bg-elev))" }}>
        <div className="mb-3 flex items-center gap-2">
          <Footprints className="h-4 w-4" style={{ color: "rgb(var(--gold-ink))" }} />
          <h2 className="text-base font-semibold tracking-tight">{zh ? "深度脚型报告" : "Deep foot report"}</h2>
          <span
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide"
            style={{ color: "rgb(var(--gold-ink))", backgroundColor: "rgb(var(--gold-ink) / 0.12)", border: "1px solid rgb(var(--gold-line) / 0.5)" }}
          >
            <Crown className="h-3 w-3" /> Max
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <span key={c} className="rounded-full border border-[rgb(var(--muted)/0.5)] px-3 py-1 text-xs font-medium soft-text">
              {c}
            </span>
          ))}
        </div>

        <ul className="mt-4 flex flex-col gap-2.5 border-t border-[rgb(var(--muted)/0.3)] pt-4">
          {points.map((pt, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "rgb(var(--gold-ink))" }} />
              <span className="soft-text">{pt}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-[0.7rem] soft-text">
          {zh
            ? "基于你最近一次脚型扫描的形态数据 · 通用选鞋倾向，仅供参考。"
            : "From your latest foot scan's shape data · general fit tendencies, for reference."}
        </p>
      </div>
    </section>
  );
}
