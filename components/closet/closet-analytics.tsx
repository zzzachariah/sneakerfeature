"use client";

// Max-only closet analytics: monthly court-time bars (last 6 months), the
// rotation ranked by hours, and cost efficiency. Pro members see a locked
// teaser that upsells Max; free members see the same teaser (their upgrade
// path passes through the same page). Charts are plain SVG/CSS, animated on
// scroll-into-view, and take each skin's voice via the pui-closet CSS tokens.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { BarChart3, Lock } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useInView, useProgress } from "@/components/motion/use-progress";
import type { PremiumVariant } from "@/components/premium/variants";
import type { Tier } from "@/lib/subscription/tiers";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { costPerSession, monthlyWear, type WearLogRow } from "@/lib/closet/wear";
import { fetchWearLogs } from "@/components/closet/closet-api";
import type { ClosetEntry } from "@/components/closet/closet-view";

export function ClosetAnalytics({
  entries,
  tier,
  variant
}: {
  entries: ClosetEntry[];
  tier: Tier;
  variant: PremiumVariant;
}) {
  const { translate } = useLocale();
  const unlocked = tier === "max";
  const [logs, setLogs] = useState<WearLogRow[] | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    fetchWearLogs().then((res) => {
      if (!cancelled && res.ok) setLogs(res.logs);
    });
    return () => {
      cancelled = true;
    };
  }, [unlocked]);

  const months = useMemo(() => monthlyWear(logs ?? []), [logs]);
  const ranked = useMemo(
    () =>
      [...entries]
        .filter((e) => Number(e.item.play_hours) > 0)
        .sort((a, b) => Number(b.item.play_hours) - Number(a.item.play_hours))
        .slice(0, 6),
    [entries]
  );

  if (entries.length === 0) return null;

  if (!unlocked) {
    if (!SUBSCRIBE_LIVE) return null;
    return (
      <section className="mt-10">
        <Link
          href={"/subscribe" as Route}
          className="premium-hover-lift flex items-center gap-4 rounded-2xl border p-4 sm:p-5"
          style={{
            borderColor: "rgba(217,180,90,0.28)",
            background: "linear-gradient(90deg, rgba(217,180,90,0.08), transparent)"
          }}
        >
          <span
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg, #f0d488, #b8912f)", color: "#1a1305" }}
          >
            <BarChart3 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-semibold text-[rgb(var(--text))]">
              {translate("Rotation analytics")}
              <span
                className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide"
                style={{ color: "#1a1305", background: "linear-gradient(135deg, #ffe38a, #c99a2a)" }}
              >
                Max
              </span>
            </p>
            <p className="mt-0.5 text-xs soft-text">
              {translate("Monthly court time, rotation ranking and cost efficiency — for Max members.")}
            </p>
          </div>
          <Lock className="h-4 w-4 shrink-0 soft-text" aria-hidden />
        </Link>
      </section>
    );
  }

  const maxHours = Math.max(1, ...months.map((m) => m.hours));
  const maxItemHours = Math.max(1, ...ranked.map((e) => Number(e.item.play_hours)));

  return (
    <section className={`pui-closet-analytics pui-closet-analytics--${variant} mt-10`}>
      <div className="mb-4 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 soft-text" aria-hidden />
        <h2 className="text-xs font-medium uppercase tracking-[0.18em] soft-text">
          {translate("Rotation analytics")}
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <MonthlyBars months={months} maxHours={maxHours} />

        <div className={`pui-closet-panel ${variant === "standard" ? "glass-lite rounded-2xl" : ""} p-4`}>
          <p className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.16em] soft-text">
            {translate("Most played")}
          </p>
          {ranked.length === 0 ? (
            <p className="py-6 text-center text-sm soft-text">{translate("Log some runs to see your rotation take shape.")}</p>
          ) : (
            <ul className="space-y-2.5">
              {ranked.map((e) => {
                const hours = Number(e.item.play_hours);
                const cps = costPerSession(e.item);
                return (
                  <li key={e.item.shoe_id}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{e.shoe.shoe_name}</span>
                      <span className="num-display shrink-0 text-[0.82rem]">
                        {Math.round(hours * 10) / 10}h
                        {cps != null ? <span className="soft-text"> · ¥{cps >= 100 ? Math.round(cps) : cps.toFixed(1)}/{translate("run")}</span> : null}
                      </span>
                    </div>
                    <RankBar share={hours / maxItemHours} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function MonthlyBars({ months, maxHours }: { months: { month: string; hours: number; sessions: number }[]; maxHours: number }) {
  const { translate } = useLocale();
  const { ref, inView } = useInView<HTMLDivElement>(0.3, { repeat: false });
  const progress = useProgress(inView);

  return (
    <div ref={ref} className="pui-closet-panel pui-closet-chart p-4">
      <p className="mb-3 text-[0.7rem] font-medium uppercase tracking-[0.16em] soft-text">
        {translate("Court time · last 6 months")}
      </p>
      <div className="flex h-36 items-end gap-2">
        {months.map((m) => {
          const h = (m.hours / maxHours) * progress;
          return (
            <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="num-display text-[0.68rem] soft-text" style={{ opacity: m.hours > 0 ? 1 : 0.4 }}>
                {m.hours > 0 ? `${Math.round(m.hours * 10) / 10}h` : "—"}
              </span>
              <div className="flex h-24 w-full items-end justify-center">
                <span
                  className="pui-closet-bar"
                  style={{ height: `${Math.max(m.hours > 0 ? 6 : 2, h * 100)}%` }}
                  aria-hidden
                />
              </div>
              <span className="text-[0.62rem] soft-text">{m.month.slice(5)}{translate("mo")}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankBar({ share }: { share: number }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.4, { repeat: false });
  const progress = useProgress(inView);
  return (
    <div ref={ref} className="mt-1 h-1 overflow-hidden rounded-full bg-[rgb(var(--text)/0.08)]">
      <span
        className="pui-closet-rankfill block h-full rounded-full"
        style={{ width: `${Math.max(0, Math.min(1, share)) * progress * 100}%` }}
      />
    </div>
  );
}
