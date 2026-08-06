"use client";

// The receipt for a run that just ended.
//
// This is where the whole court-timer feature cashes out. Everything before it
// is a clock; this is the part that answers "so what" — what that hour did to
// the midsole, what the pair now costs per run, how the week is going. Without
// it the timer just moves a number in a database nobody looks at.
//
// Reached two ways, both landing on /closet?session=<shoeId>:
//   • in-app, from the "已记录 1.5h" confirmation in the floating bar
//   • from the Dynamic Island's farewell card, which lingers a few seconds
//     after 结束 — often the only surface the user is looking at, because the
//     phone never came out of the bag.
//
// Keyed by shoe, not by log id, because the Island ends runs in a background
// process that cannot write to the database — the log lands later. "That pair's
// newest run" is the one handle both paths share.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { useLocale } from "@/components/i18n/locale-provider";
import { fetchWearLogs } from "@/components/closet/closet-api";
import { WIDGETS_REFRESH_EVENT } from "@/lib/closet/court-session-store";
import {
  costPerSession,
  wearRatio,
  wearStatus,
  WEAR_STATUS_LABEL,
  type WearLogRow
} from "@/lib/closet/wear";
import type { ClosetEntry } from "@/components/closet/closet-view";

/** How many past runs the history list shows under the headline. */
const HISTORY_LIMIT = 5;

export function SessionReceiptSheet({
  entry,
  onClose
}: {
  entry: ClosetEntry | null;
  onClose: () => void;
}) {
  const { translate } = useLocale();
  const [logs, setLogs] = useState<WearLogRow[] | null>(null);
  const open = entry !== null;
  const shoeId = entry?.item.shoe_id ?? null;

  const load = useCallback(async () => {
    if (!shoeId) return;
    const res = await fetchWearLogs();
    if (!res.ok) {
      setLogs([]);
      return;
    }
    setLogs(
      res.logs
        .filter((log) => log.shoe_id === shoeId)
        // played_at is a date, so same-day runs tie — created_at breaks it, and
        // it's the tiebreak that matters here: the run you just finished has to
        // come out on top of the one you logged this morning.
        .sort(
          (a, b) =>
            b.played_at.localeCompare(a.played_at) || b.created_at.localeCompare(a.created_at)
        )
    );
  }, [shoeId]);

  useEffect(() => {
    if (!open) {
      setLogs(null);
      return;
    }
    void load();
  }, [open, load]);

  // A run ended from the Island lands here before the app has finished posting
  // its wear log — the provider drains that queue on the same resume that
  // opened this sheet. requestWidgetRefresh() fires once the POST succeeds, so
  // that's the cue to re-read rather than show a receipt that's one run stale.
  useEffect(() => {
    if (!open) return;
    const onRefresh = () => void load();
    window.addEventListener(WIDGETS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(WIDGETS_REFRESH_EVENT, onRefresh);
  }, [open, load]);

  const latest = logs?.[0] ?? null;
  const history = useMemo(() => (logs ?? []).slice(1, 1 + HISTORY_LIMIT), [logs]);

  const item = entry?.item;
  const ratio = item ? wearRatio(Number(item.play_hours)) : 0;
  const status = item ? wearStatus(Number(item.play_hours)) : "fresh";
  const cps = item ? costPerSession(item) : null;

  return (
    <BottomSheet open={open} onClose={onClose} title={translate("Session logged")}>
      {entry && item ? (
        <div className="space-y-5 pb-2">
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 shrink-0">
              <ShoeImage
                src={entry.shoe.image_url ?? undefined}
                alt={`${entry.shoe.brand} ${entry.shoe.shoe_name}`}
                fallbackLabel={entry.shoe.shoe_name}
                variant="closet"
                stage={false}
                className="h-full w-full"
              />
            </div>
            <div className="min-w-0">
              <p className="text-xs soft-text">{entry.shoe.brand}</p>
              <p className="truncate text-[0.95rem] font-semibold">{entry.shoe.shoe_name}</p>
            </div>
          </div>

          {/* The headline: what this run added. */}
          <div className="glass-lite rounded-2xl px-4 py-3.5">
            <p className="t-eyebrow mb-1">{translate("This session")}</p>
            {logs === null ? (
              <p className="text-sm soft-text">{translate("Loading...")}</p>
            ) : latest ? (
              <p className="flex items-baseline gap-2">
                <span className="num-display text-2xl font-bold">{formatHours(latest.hours)}</span>
                <span className="text-xs soft-text">{latest.played_at}</span>
              </p>
            ) : (
              <p className="text-sm soft-text">{translate("Nothing logged for this pair yet.")}</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat
              value={`${Math.round(Number(item.play_hours) * 10) / 10}h`}
              label={translate("Court hours")}
            />
            <Stat value={String(item.sessions)} label={translate("Sessions")} />
            <Stat
              value={cps != null ? `¥${Math.round(cps)}` : "—"}
              label={translate("per run")}
            />
          </div>

          {/* Cushion life. A plain bar rather than the skinned WearMeter: this
              sheet is the same in every premium variant, so a variant-specific
              meter here would read as a different product than the wall behind it. */}
          <div className="space-y-1.5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[rgb(var(--muted)/0.6)]">
              <div
                className={`h-full rounded-full transition-[width] duration-500 ${
                  status === "retire" ? "bg-[rgb(var(--brand))]" : "bg-[rgb(var(--text)/0.65)]"
                }`}
                style={{ width: `${Math.min(100, Math.max(2, ratio * 100))}%` }}
              />
            </div>
            <p className="flex items-center justify-between text-[0.72rem] soft-text">
              <span>{translate(WEAR_STATUS_LABEL[status])}</span>
              <span className="num-display">
                {Math.round(Math.max(0, 1 - Math.min(1, ratio)) * 100)}% {translate("cushion left")}
              </span>
            </p>
          </div>

          {history.length > 0 ? (
            <div className="space-y-1.5">
              <p className="t-eyebrow">{translate("Recent runs")}</p>
              <ul className="space-y-1">
                {history.map((log) => (
                  <li
                    key={log.id}
                    className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm odd:bg-[rgb(var(--text)/0.04)]"
                  >
                    <span className="soft-text">{log.played_at}</span>
                    <span className="num-display font-medium">{formatHours(log.hours)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="glass-lite rounded-xl px-3 py-2.5 text-center">
      <p className="num-display text-base font-semibold">{value}</p>
      <p className="mt-0.5 text-[0.68rem] soft-text">{label}</p>
    </div>
  );
}

/** "1.5h", trailing ".0" dropped — same rule as the widget's WidgetCopy.hours. */
function formatHours(value: number): string {
  const rounded = Math.round(Number(value) * 100) / 100;
  return `${rounded}h`;
}
