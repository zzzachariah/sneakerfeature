"use client";

import Link from "next/link";
import { Ruler, Crown, ScanLine, LogIn, ChevronRight, Check, TriangleAlert } from "lucide-react";
import type { SizeAdvice, WidthVerdictLevel } from "@/lib/foot-scan/fit-advisor";
import { TIERS } from "@/lib/subscription/tiers";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";

const GOLD = TIERS.max.badgeHue;

export type SizeAdvisorData =
  | { state: "signed-out" }
  | { state: "gated"; hasScan?: boolean }
  | { state: "no-profile" }
  | { state: "advice"; advice: SizeAdvice };

function SectionShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="mx-auto mt-8 w-full max-w-3xl px-4 sm:px-6">
      <div
        className="overflow-hidden rounded-2xl border p-5 sm:p-6"
        style={{ borderColor: `${GOLD}44`, background: "rgb(var(--bg-elev))" }}
      >
        <div className="mb-4 flex items-center gap-2">
          <Ruler className="h-4 w-4" style={{ color: GOLD }} />
          <h2 className="text-base font-semibold tracking-tight">智能尺码建议</h2>
          <span
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide"
            style={{ color: GOLD, backgroundColor: `${GOLD}1f`, border: `1px solid ${GOLD}55` }}
          >
            <Crown className="h-3 w-3" /> Premium
          </span>
        </div>
        {children}
      </div>
    </section>
  );
}

function widthChip(level: WidthVerdictLevel): { label: string; color: string; Icon: typeof Check } {
  switch (level) {
    case "good":
      return { label: "宽度匹配", color: "var(--score-elite)", Icon: Check };
    case "roomy":
      return { label: "偏松", color: "var(--score-mid)", Icon: TriangleAlert };
    case "snug":
      return { label: "偏紧", color: "var(--score-mid)", Icon: TriangleAlert };
    case "caution":
      return { label: "宽度警示", color: "var(--score-low)", Icon: TriangleAlert };
  }
}

export function SizeAdvisorCard({ data }: { data: SizeAdvisorData }) {
  if (data.state === "signed-out") {
    return (
      <SectionShell>
        <p className="text-sm soft-text">登录后，结合你的脚型扫描，Pro/Max 会算出你在这双鞋应该买几码。</p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--muted)/0.5)] px-4 py-2 text-sm font-medium transition hover:bg-[rgb(var(--text)/0.05)]"
        >
          <LogIn className="h-4 w-4" /> 登录
        </Link>
      </SectionShell>
    );
  }

  if (data.state === "gated") {
    // A free user who has ALREADY scanned their feet is the highest-intent case:
    // the answer for this exact shoe is computable right now. We deliberately do
    // NOT send the number to the client — only the fact that it exists, blurred —
    // so the paywall can't be bypassed by reading the DOM.
    if (data.hasScan) {
      return (
        <SectionShell>
          <p className="text-sm soft-text">
            我们已根据你的脚型，算好了这双鞋的<span style={{ color: GOLD }}>建议尺码、宽度与楦型提示</span>。
          </p>
          <div className="relative mt-4 overflow-hidden rounded-xl border" style={{ borderColor: `${GOLD}33` }}>
            <div className="flex items-center gap-3 p-4" aria-hidden>
              <div className="select-none blur-[7px]">
                <div className="num-display text-2xl font-bold tracking-tight">US 10.5</div>
                <div className="mt-1 text-xs soft-text">宽度匹配 · 楦型合适 · 建议系法……</div>
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-[rgb(var(--bg-elev)/0.35)]">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                style={{ color: "#1a1305", background: `linear-gradient(135deg, ${GOLD}, #b8912f)` }}
              >
                <Crown className="h-3.5 w-3.5" /> 解锁查看
              </span>
            </div>
          </div>
          {SUBSCRIBE_LIVE && (
            <Link
              href="/subscribe"
              className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.99]"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912f)`, color: "#1a1305" }}
            >
              <Crown className="h-4 w-4" /> 解锁我的尺码 <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </SectionShell>
      );
    }
    return (
      <SectionShell>
        <p className="text-sm soft-text">
          逐款精准尺码是 <span style={{ color: GOLD }}>Pro / Max</span> 专属：结合你的脚型扫描，给出这双鞋的建议尺码、宽度与楦型提示。
        </p>
        {SUBSCRIBE_LIVE && (
          <Link
            href="/subscribe"
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.99]"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912f)`, color: "#1a1305" }}
          >
            <Crown className="h-4 w-4" /> 解锁精准尺码 <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </SectionShell>
    );
  }

  if (data.state === "no-profile") {
    return (
      <SectionShell>
        <p className="text-sm soft-text">先完成一次脚型扫描，我就能算出你在这双鞋该买几码 —— 只需手机拍几张脚的照片。</p>
        <Link
          href="/foot-scan"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-[rgb(var(--text)/0.05)]"
          style={{ borderColor: `${GOLD}66`, color: GOLD }}
        >
          <ScanLine className="h-4 w-4" /> 去扫描脚型
        </Link>
      </SectionShell>
    );
  }

  const a = data.advice;
  const chip = widthChip(a.width.level);
  const WidthIcon = chip.Icon;
  return (
    <SectionShell>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide soft-text">建议尺码</p>
          <p className="num-display mt-1 text-4xl font-bold tracking-tight" style={{ color: GOLD }}>
            US {a.recommendedUs}
          </p>
          <p className="mt-0.5 text-xs soft-text">
            ≈ EU {a.recommendedEu}
            {a.offsetHalfSizes !== 0 && (
              <>
                {" · "}
                较正常码{a.offsetHalfSizes > 0 ? "大" : "小"}
                {Math.abs(a.offsetHalfSizes) * 0.5}
                码
              </>
            )}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide soft-text">宽度</p>
          <span
            className="mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium"
            style={{ color: `rgb(${chip.color})`, backgroundColor: `rgb(${chip.color} / 0.14)`, border: `1px solid rgb(${chip.color} / 0.4)` }}
          >
            <WidthIcon className="h-3.5 w-3.5" /> {chip.label}
          </span>
        </div>
      </div>

      <p className="mt-4 text-sm text-[rgb(var(--text))]">{a.width.text}</p>

      {a.notes.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2 border-t border-[rgb(var(--muted)/0.3)] pt-4">
          {a.notes.map((n, i) => (
            <li key={i} className="flex items-start gap-2 text-sm soft-text">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: GOLD }} />
              {n}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[0.7rem] soft-text">
        {a.precise ? "基于该款逐款尺码数据" : "该款暂无逐款数据，以下为品牌级估算"} · 置信度：
        {a.confidence === "high" ? "高" : a.confidence === "medium" ? "中" : "低"} · 建议仅供参考，最终以试穿为准。
      </p>
    </SectionShell>
  );
}
