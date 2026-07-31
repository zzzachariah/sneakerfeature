"use client";

import { useState } from "react";
import { Link2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { trackingUrl } from "@/lib/outreach/queue";
import { CHANNEL_STATUSES } from "@/lib/outreach/types";
import type {
  ChannelStatus,
  OutreachChannelView,
  OutreachLogEntry,
  OutreachSettings
} from "@/lib/outreach/types";
import { Chip, INPUT_CLASS, Mono, StatInput, formatUsd } from "./outreach-ui";

const STATUS_TONE: Record<ChannelStatus, "neutral" | "accent" | "success"> = {
  "not started": "neutral",
  running: "accent",
  done: "success",
  dropped: "neutral"
};

export function ChannelCard({
  channel,
  settings,
  logs,
  busy,
  onPatch,
  onAddLog
}: {
  channel: OutreachChannelView;
  settings: OutreachSettings;
  logs: OutreachLogEntry[];
  busy: boolean;
  onPatch: (fields: Record<string, unknown>) => void;
  onAddLog: (entryDate: string, note: string) => void;
}) {
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logNote, setLogNote] = useState("");

  return (
    <article className="surface-card premium-border space-y-4 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="accent">{channel.id}</Chip>
        <span className="text-[0.7rem] soft-text">{channel.kind}</span>
        <Chip tone={STATUS_TONE[channel.status]} className={cn(channel.status === "dropped" && "line-through")}>
          {channel.status}
        </Chip>
        <Mono className="ml-auto">{channel.ref_code}</Mono>
      </div>

      <h3 className="text-base font-semibold tracking-[-0.01em] break-words">{channel.name}</h3>

      <div className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface))] p-3">
        <p className="flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.08em] soft-text">
          <Play className="h-3 w-3" />
          First action
        </p>
        <p className="mt-1 text-sm leading-relaxed break-words">{channel.first_action}</p>
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">Why</p>
        <p className="mt-1 text-sm leading-relaxed soft-text break-words">{channel.why}</p>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <span className="soft-text">
          Expected <span className="text-[rgb(var(--text))]">{channel.expected}</span>
        </span>
        <span className="soft-text">
          Cost <span className="text-[rgb(var(--text))]">{channel.cost}</span>
        </span>
        <span className="soft-text">
          Commission owed{" "}
          <span className="font-semibold tabular-nums text-[rgb(var(--text))]">
            {formatUsd(channel.commission_owed)}
          </span>
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">Status</span>
        <select
          disabled={busy}
          value={channel.status}
          onChange={(e) => onPatch({ status: e.target.value as ChannelStatus })}
          className={INPUT_CLASS}
        >
          {CHANNEL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatInput
          label="Clicks"
          value={channel.clicks}
          disabled={busy}
          onCommit={(v) => onPatch({ clicks: v })}
        />
        <StatInput
          label="Signups"
          value={channel.registrations}
          disabled={busy}
          onCommit={(v) => onPatch({ registrations: v })}
        />
        <StatInput
          label="Paid"
          value={channel.paid_count}
          disabled={busy}
          onCommit={(v) => onPatch({ paid_count: v })}
        />
        <StatInput
          label="Revenue"
          value={channel.revenue_usd}
          step={0.01}
          prefix="$"
          disabled={busy}
          onCommit={(v) => onPatch({ revenue_usd: v })}
        />
      </div>

      <p className="break-all text-[0.65rem] soft-text">
        {trackingUrl(settings, channel.ref_code)}
      </p>

      <details className="group rounded-xl border border-[rgb(var(--muted)/0.45)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs font-semibold transition hover:bg-[rgb(var(--text)/0.04)]">
          <span className="inline-flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" />
            Log
            <span className="soft-text">({logs.length})</span>
          </span>
          <span className="soft-text transition group-open:rotate-90">›</span>
        </summary>
        <div className="space-y-3 border-t border-[rgb(var(--muted)/0.45)] p-3">
          {logs.length === 0 ? (
            <p className="text-xs soft-text">No entries yet.</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((entry) => (
                <li key={entry.id} className="flex gap-2 text-xs">
                  <Mono className="shrink-0">{entry.entry_date}</Mono>
                  <span className="min-w-0 break-words">{entry.note}</span>
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (!logNote.trim()) return;
              onAddLog(logDate, logNote.trim());
              setLogNote("");
            }}
          >
            <input
              type="date"
              aria-label="Log entry date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className={cn(INPUT_CLASS, "sm:w-40 tabular-nums")}
            />
            <input
              type="text"
              aria-label="Log entry note"
              placeholder="What happened?"
              value={logNote}
              onChange={(e) => setLogNote(e.target.value)}
              className={INPUT_CLASS}
            />
            <button
              type="submit"
              disabled={busy || !logNote.trim()}
              className="min-h-[2.25rem] shrink-0 rounded-lg border border-[rgb(var(--accent)/0.6)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.1)] disabled:opacity-40"
            >
              Add
            </button>
          </form>
        </div>
      </details>
    </article>
  );
}
