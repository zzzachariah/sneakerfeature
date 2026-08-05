"use client";

// The Smart Picker's credits ledger — opened from the balance pill in the
// header or from any turn's cost chip.
//
// It answers four questions that the bare "12 credits" pill could not: how much
// is left, where the credits came from, where they went (day by day), and which
// conversation ate the most. The check-in claim lives here too, so earning and
// spending are read in one place.
//
// Skinning: the structure is one component; the LOOK is per Premium UI variant
// (see app/credits-skins.css). Standard is a clean glass card; editorial reads
// as a printed statement, instrument as a telemetry readout, gallery as a
// gallery label, arena as a scoreboard. Variant also picks the panel's title,
// because "Statement" and "Telemetry" belong to different design languages.

import { useCallback, useEffect, useState } from "react";
import { Coins, Loader2, Sparkles, TrendingDown } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePremiumVariant, type PremiumVariant } from "@/components/premium/variants";
import { CheckinBadge } from "@/components/smart-picker/checkin-badge";
import type { CheckinStatus } from "@/lib/ai/checkin";

export type UsageSummary = {
  tier: "free" | "pro" | "max";
  unlimited: boolean;
  balance: number;
  allowance: { balance: number; grant: number } | null;
  checkin: CheckinStatus;
  totals: {
    spent: number;
    earned: { checkin: number; purchase: number; other: number };
    turns: number;
    charged: number;
    avgPerTurn: number;
  };
  daily: { day: string; credits: number }[];
  perChat: { id: string; title: string | null; credits: number; turns: number; lastAt: string }[];
  recent: { delta: number; reason: string; label: string | null; at: string }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Live balance from the chat stream, so the panel opens already correct. */
  balance: number;
  unlimited: boolean;
  checkin: CheckinStatus;
  onClaimCheckin: () => Promise<void>;
  onSelectChat: (id: string) => void;
};

// Panel title per design language. Same data, different vocabulary — an
// editorial skin says "Statement", an arena skin says "Scoreboard".
const VARIANT_TITLE: Record<PremiumVariant, string> = {
  standard: "Credits & usage",
  editorial: "Credit statement",
  instrument: "Usage telemetry",
  gallery: "Credit record",
  arena: "Credit scoreboard"
};

const REASON_LABEL: Record<string, { en: string; zh: string }> = {
  spend: { en: "Smart Picker", zh: "智能选鞋" },
  daily_checkin: { en: "Daily check-in", zh: "每日签到" },
  recharge: { en: "Purchase", zh: "充值" },
  admin_clear: { en: "Admin adjustment", zh: "管理员调整" }
};

function reasonLabel(reason: string, zh: boolean): string {
  const hit = REASON_LABEL[reason];
  if (hit) return zh ? hit.zh : hit.en;
  return reason.replace(/_/g, " ");
}

function shortDate(iso: string, zh: boolean): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return zh
    ? `${d.getMonth() + 1}月${d.getDate()}日`
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function CreditsPanel({
  open,
  onClose,
  balance,
  unlimited,
  checkin,
  onClaimCheckin,
  onSelectChat
}: Props) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  const variant = usePremiumVariant();
  const [data, setData] = useState<UsageSummary | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/usage");
      const json = await res.json();
      if (json?.ok) setData(json as UsageSummary);
    } catch {
      /* leave the last snapshot on screen rather than blanking the panel */
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch on every open: a turn almost certainly spent something since the
  // panel was last read, and a stale ledger is worse than a brief spinner.
  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const claim = useCallback(async () => {
    await onClaimCheckin();
    await load();
  }, [onClaimCheckin, load]);

  const totals = data?.totals;
  const earnedTotal = totals ? totals.earned.checkin + totals.earned.purchase + totals.earned.other : 0;
  const peakDay = data?.daily.reduce((max, d) => Math.max(max, d.credits), 0) ?? 0;
  const topChatCredits = data?.perChat[0]?.credits ?? 0;
  const allowance = data?.allowance ?? null;

  return (
    <Modal open={open} onClose={onClose} title={translate(VARIANT_TITLE[variant])} maxWidthClass="max-w-xl">
      <div className={`sp-usage sp-usage--${variant}`}>
        {/* ── Headline: what's left right now ─────────────────────────────── */}
        <div className="sp-usage-hero">
          <div className="min-w-0">
            <p className="sp-usage-k">{translate("Balance")}</p>
            <p className="sp-usage-hero-v num-display">
              {unlimited ? "∞" : (data?.balance ?? balance)}
              <span className="sp-usage-hero-unit">{unlimited ? "" : translate("credits")}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {checkin.canClaim ? (
              <CheckinBadge canClaim dailyAmount={checkin.dailyAmount} onClaim={claim} size="md" />
            ) : (
              <span className="sp-usage-note">
                {checkin.dailyAmount > 0
                  ? zh
                    ? `每日签到 +${checkin.dailyAmount}`
                    : `Daily check-in +${checkin.dailyAmount}`
                  : ""}
              </span>
            )}
          </div>
        </div>

        {allowance && (
          <div className="sp-usage-allowance">
            <div className="mb-1.5 flex items-baseline justify-between gap-3">
              <span className="sp-usage-k inline-flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" aria-hidden />
                {translate("Premium model allowance")}
              </span>
              <span className="num-display text-[0.8rem] font-semibold">
                {allowance.balance}
                <span className="soft-text"> / {allowance.grant}</span>
              </span>
            </div>
            <span className="sp-usage-track" aria-hidden>
              <span
                className="sp-usage-fill"
                style={{
                  width: `${allowance.grant > 0 ? Math.max(0, Math.min(100, (allowance.balance / allowance.grant) * 100)) : 0}%`
                }}
              />
            </span>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center gap-2 py-10 soft-text" aria-busy="true">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            <span className="text-sm">{translate("Loading...")}</span>
          </div>
        )}

        {data && (
          <>
            {/* ── Lifetime counters ──────────────────────────────────────── */}
            <div className="sp-usage-stats">
              <Stat k={translate("Spent")} v={String(totals?.charged ?? 0)} />
              <Stat k={translate("Earned")} v={String(earnedTotal)} />
              <Stat k={translate("Picks run")} v={String(totals?.turns ?? 0)} />
              <Stat k={translate("Avg per pick")} v={String(totals?.avgPerTurn ?? 0)} />
            </div>

            {/* ── Daily spend, last two weeks ────────────────────────────── */}
            <section className="sp-usage-section">
              <h3 className="sp-usage-h">
                <TrendingDown className="h-3.5 w-3.5" aria-hidden />
                {translate("Last 14 days")}
              </h3>
              {peakDay === 0 ? (
                <p className="sp-usage-empty">{translate("Nothing spent in the last two weeks.")}</p>
              ) : (
                <div className="sp-usage-chart" role="img" aria-label={translate("Daily credit spend")}>
                  {data.daily.map((d) => (
                    <span key={d.day} className="sp-usage-col" title={`${shortDate(d.day, zh)} · ${d.credits}`}>
                      <span
                        className={`sp-usage-bar ${d.credits === 0 ? "is-zero" : ""}`}
                        style={{ height: `${d.credits === 0 ? 3 : Math.max(8, (d.credits / peakDay) * 100)}%` }}
                      />
                    </span>
                  ))}
                </div>
              )}
            </section>

            {/* ── Which conversations cost the most ──────────────────────── */}
            <section className="sp-usage-section">
              <h3 className="sp-usage-h">
                <Coins className="h-3.5 w-3.5" aria-hidden />
                {translate("Biggest spenders")}
              </h3>
              {data.perChat.length === 0 ? (
                <p className="sp-usage-empty">{translate("No conversations have been charged yet.")}</p>
              ) : (
                <ul className="space-y-1">
                  {data.perChat.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onSelectChat(c.id);
                          onClose();
                        }}
                        className="sp-usage-row"
                      >
                        <span
                          className="sp-usage-rowfill"
                          style={{ width: `${topChatCredits > 0 ? (c.credits / topChatCredits) * 100 : 0}%` }}
                          aria-hidden
                        />
                        <span className="sp-usage-rowlabel">{c.title?.trim() || translate("New conversation")}</span>
                        {/* "8 · ×3" = eight units spent across three turns.
                            Symbolic on purpose — it reads the same in both
                            languages and matches the composer's ×N control. */}
                        <span className="sp-usage-rowmeta num-display" title={translate("Turns in this conversation")}>
                          {c.credits}
                          <span className="soft-text"> · ×{c.turns}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── Raw ledger ─────────────────────────────────────────────── */}
            {data.recent.length > 0 && (
              <section className="sp-usage-section">
                <h3 className="sp-usage-h">{translate("Recent activity")}</h3>
                <ul className="sp-usage-ledger">
                  {data.recent.map((r, i) => (
                    <li key={`${r.at}-${i}`}>
                      <span className="min-w-0 flex-1 truncate">
                        {reasonLabel(r.reason, zh)}
                        {r.label ? <span className="soft-text"> · {r.label}</span> : null}
                      </span>
                      <span className="shrink-0 soft-text">{shortDate(r.at, zh)}</span>
                      <span className={`num-display shrink-0 font-semibold ${r.delta >= 0 ? "sp-usage-in" : "sp-usage-out"}`}>
                        {r.delta >= 0 ? "+" : ""}
                        {r.delta}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="sp-usage-stat">
      <span className="sp-usage-stat-v num-display">{v}</span>
      <span className="sp-usage-k">{k}</span>
    </div>
  );
}
