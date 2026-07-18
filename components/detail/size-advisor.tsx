"use client";

import Link from "next/link";
import { Ruler, Crown, ScanLine, LogIn, ChevronRight, Check, TriangleAlert } from "lucide-react";
import type { SizeAdvice, WidthVerdictLevel } from "@/lib/foot-scan/fit-advisor";
import { TIERS } from "@/lib/subscription/tiers";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { useLocale } from "@/components/i18n/locale-provider";

const GOLD = TIERS.max.badgeHue;

export type SizeAdvisorData =
  | { state: "signed-out" }
  | { state: "gated"; hasScan?: boolean }
  | { state: "no-profile" }
  | { state: "advice"; advice: SizeAdvice };

function SectionShell({ children }: { children: React.ReactNode }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  return (
    <section className="mx-auto mt-8 w-full max-w-3xl px-4 sm:px-6">
      <div
        className="overflow-hidden rounded-2xl border p-5 sm:p-6"
        style={{ borderColor: "rgb(var(--gold-line) / 0.32)", background: "rgb(var(--bg-elev))" }}
      >
        <div className="mb-4 flex items-center gap-2">
          <Ruler className="h-4 w-4" style={{ color: "rgb(var(--gold-ink))" }} />
          <h2 className="text-base font-semibold tracking-tight">{zh ? "智能尺码建议" : "Smart size advisor"}</h2>
          <span
            className="ml-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide"
            style={{ color: "rgb(var(--gold-ink))", backgroundColor: "rgb(var(--gold-ink) / 0.12)", border: "1px solid rgb(var(--gold-line) / 0.5)" }}
          >
            <Crown className="h-3 w-3" /> Premium
          </span>
        </div>
        {children}
      </div>
    </section>
  );
}

function widthChip(level: WidthVerdictLevel, zh: boolean): { label: string; color: string; Icon: typeof Check } {
  switch (level) {
    case "good":
      return { label: zh ? "宽度匹配" : "Width fits", color: "var(--score-elite)", Icon: Check };
    case "roomy":
      return { label: zh ? "偏松" : "Roomy", color: "var(--score-mid)", Icon: TriangleAlert };
    case "snug":
      return { label: zh ? "偏紧" : "Snug", color: "var(--score-mid)", Icon: TriangleAlert };
    case "caution":
      return { label: zh ? "宽度警示" : "Width caution", color: "var(--score-low)", Icon: TriangleAlert };
  }
}

export function SizeAdvisorCard({ data }: { data: SizeAdvisorData }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const t = (z: string, e: string) => (zh ? z : e);

  if (data.state === "signed-out") {
    return (
      <SectionShell>
        <p className="text-sm soft-text">
          {t(
            "登录后，结合你的脚型扫描，Pro/Max 会算出你在这双鞋应该买几码。",
            "Sign in and, with your foot scan, Pro/Max works out exactly what size to buy in this shoe."
          )}
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[rgb(var(--muted)/0.5)] px-4 py-2 text-sm font-medium transition hover:bg-[rgb(var(--text)/0.05)]"
        >
          <LogIn className="h-4 w-4" /> {t("登录", "Log in")}
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
            {t("我们已根据你的脚型，算好了这双鞋的", "We've already worked out your ")}
            <span style={{ color: "rgb(var(--gold-ink))" }}>{t("建议尺码、宽度与楦型提示", "recommended size, width & last fit for this shoe")}</span>
            {t("。", ".")}
          </p>
          <div className="relative mt-4 overflow-hidden rounded-xl border" style={{ borderColor: "rgb(var(--gold-line) / 0.3)" }}>
            <div className="flex items-center gap-3 p-4" aria-hidden>
              <div className="select-none blur-[7px]">
                <div className="num-display text-2xl font-bold tracking-tight">US 10.5</div>
                <div className="mt-1 text-xs soft-text">{t("宽度匹配 · 楦型合适 · 建议系法……", "Width fits · last suits you · lacing tips…")}</div>
              </div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-[rgb(var(--bg-elev)/0.35)]">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold"
                style={{ color: "#1a1305", background: `linear-gradient(135deg, ${GOLD}, #b8912f)` }}
              >
                <Crown className="h-3.5 w-3.5" /> {t("解锁查看", "Unlock")}
              </span>
            </div>
          </div>
          {SUBSCRIBE_LIVE && (
            <Link
              href="/subscribe"
              className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition active:scale-[0.99]"
              style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912f)`, color: "#1a1305" }}
            >
              <Crown className="h-4 w-4" /> {t("解锁我的尺码", "Unlock my size")} <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </SectionShell>
      );
    }
    return (
      <SectionShell>
        <p className="text-sm soft-text">
          {t("逐款精准尺码是 ", "Per-shoe precise sizing is ")}
          <span style={{ color: "rgb(var(--gold-ink))" }}>Pro / Max</span>
          {t(
            " 专属：结合你的脚型扫描，给出这双鞋的建议尺码、宽度与楦型提示。",
            " only: with your foot scan, it gives this shoe's recommended size, width and last fit."
          )}
        </p>
        {SUBSCRIBE_LIVE && (
          <Link
            href="/subscribe"
            className="mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.99]"
            style={{ background: `linear-gradient(135deg, ${GOLD}, #b8912f)`, color: "#1a1305" }}
          >
            <Crown className="h-4 w-4" /> {t("解锁精准尺码", "Unlock precise sizing")} <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </SectionShell>
    );
  }

  if (data.state === "no-profile") {
    return (
      <SectionShell>
        <p className="text-sm soft-text">
          {t(
            "先完成一次脚型扫描，我就能算出你在这双鞋该买几码 —— 只需手机拍几张脚的照片。",
            "Do a quick foot scan first and I can work out your size in this shoe — just a few phone photos of your feet."
          )}
        </p>
        <Link
          href="/foot-scan"
          className="mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition hover:bg-[rgb(var(--text)/0.05)]"
          style={{ borderColor: "rgb(var(--gold-line) / 0.5)", color: "rgb(var(--gold-ink))" }}
        >
          <ScanLine className="h-4 w-4" /> {t("去扫描脚型", "Scan my feet")}
        </Link>
      </SectionShell>
    );
  }

  const a = data.advice;
  const chip = widthChip(a.width.level, zh);
  const WidthIcon = chip.Icon;
  return (
    <SectionShell>
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="text-xs uppercase tracking-wide soft-text">{t("建议尺码", "Recommended size")}</p>
          <p className="num-display mt-1 text-4xl font-bold tracking-tight" style={{ color: "rgb(var(--gold-ink))" }}>
            US {a.recommendedUs}
          </p>
          <p className="mt-0.5 text-xs soft-text">
            ≈ EU {a.recommendedEu}
            {a.offsetHalfSizes !== 0 &&
              (zh ? (
                <>
                  {" · "}
                  较正常码{a.offsetHalfSizes > 0 ? "大" : "小"}
                  {Math.abs(a.offsetHalfSizes) * 0.5}
                  码
                </>
              ) : (
                <>
                  {" · "}
                  {Math.abs(a.offsetHalfSizes) * 0.5} size {a.offsetHalfSizes > 0 ? "up" : "down"} from normal
                </>
              ))}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide soft-text">{t("宽度", "Width")}</p>
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
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "rgb(var(--gold-ink))" }} />
              {n}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[0.7rem] soft-text">
        {a.precise
          ? t("基于该款逐款尺码数据", "Based on this shoe's per-model sizing data")
          : t("该款暂无逐款数据，以下为品牌级估算", "No per-model data yet — brand-level estimate")}
        {t(" · 置信度：", " · confidence: ")}
        {a.confidence === "high" ? t("高", "high") : a.confidence === "medium" ? t("中", "medium") : t("低", "low")}
        {t(" · 建议仅供参考，最终以试穿为准。", " · guidance only; always confirm by trying them on.")}
      </p>
    </SectionShell>
  );
}
