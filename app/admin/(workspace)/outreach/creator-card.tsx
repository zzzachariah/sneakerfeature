"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Link2,
  Mail,
  MessageCircle,
  Send,
  ShieldCheck,
  ShieldQuestion,
  CornerUpRight,
  Reply,
  PauseCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { canFollowUp, canSend, trackingUrl } from "@/lib/outreach/queue";
import { STAGES, VERIFICATION_STATES } from "@/lib/outreach/types";
import type {
  OutreachCreatorView,
  OutreachLogEntry,
  OutreachSettings,
  Stage,
  VerificationState
} from "@/lib/outreach/types";
import {
  Chip,
  INPUT_CLASS,
  InlineField,
  Mono,
  PipRow,
  StatInput,
  elapsedLabel,
  formatUsd,
  hostnameOf
} from "./outreach-ui";

const CHANNEL_ICON = { email: Mail, wechat: MessageCircle, dm: MessageCircle } as const;

const VERIFY_TONE: Record<VerificationState, "error" | "warn" | "success"> = {
  no: "error",
  partial: "warn",
  yes: "success"
};

const VERIFY_BAR: Record<VerificationState, string> = {
  no: "bg-[rgb(var(--error))] w-1/3",
  partial: "bg-[rgb(var(--gold-line))] w-2/3",
  yes: "bg-[rgb(var(--success))] w-full"
};

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          // Clipboard denied (insecure context / permission) — the value is
          // visible on the card either way, so there is nothing to recover.
        }
      }}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[rgb(var(--muted)/0.5)] text-[rgb(var(--text)/0.7)] transition hover:bg-[rgb(var(--text)/0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.2)]"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function CreatorCard({
  creator,
  settings,
  logs,
  busy,
  onPatch,
  onQuickAction,
  onVerify,
  onAddLog
}: {
  creator: OutreachCreatorView;
  settings: OutreachSettings;
  logs: OutreachLogEntry[];
  busy: boolean;
  onPatch: (fields: Record<string, unknown>) => void;
  onQuickAction: (action: "sent" | "followed_up" | "replied") => void;
  onVerify: (verified: VerificationState, note: string | null) => void;
  onAddLog: (entryDate: string, note: string) => void;
}) {
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logNote, setLogNote] = useState("");

  const parked = creator.is_parked;
  const sendable = canSend(creator, settings);
  const followable = canFollowUp(creator, settings);
  const replyable = !parked && creator.first_sent !== null && creator.reply_date === null;
  const ChannelIcon = CHANNEL_ICON[creator.channel];
  const waveHeld = !settings.sending_waves.includes(creator.wave);

  return (
    <article
      className={cn(
        "surface-card premium-border relative overflow-hidden rounded-2xl",
        // Parked records are greyed and surface no action, ever. They stay on
        // the page because the history still matters — just not the prompting.
        parked && "opacity-60"
      )}
    >
      {/* Verification bar — the first thing you see on every card. */}
      <div className="h-1 w-full bg-[rgb(var(--muted)/0.5)]">
        <div className={cn("h-full transition-all", VERIFY_BAR[creator.verified])} />
      </div>

      <div className="space-y-4 p-4">
        {/* Shoebox end-label row: wave, market, ref code */}
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="accent">wave {creator.wave}</Chip>
          <span className="text-[0.7rem] soft-text">{creator.market}</span>
          <span className="ml-auto flex items-center gap-1">
            <Mono>{creator.ref_code}</Mono>
            <CopyButton value={trackingUrl(settings, creator.ref_code)} label="tracking URL" />
          </span>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-[-0.01em] break-words">{creator.name}</h3>
            <Chip tone={VERIFY_TONE[creator.verified]}>
              {creator.verified === "yes" ? (
                <ShieldCheck className="h-3 w-3" />
              ) : (
                <ShieldQuestion className="h-3 w-3" />
              )}
              {creator.verified === "yes" ? "verified" : creator.verified}
            </Chip>
            {parked && (
              <Chip tone="neutral">
                <PauseCircle className="h-3 w-3" />
                parked
              </Chip>
            )}
          </div>
          <p className="mt-1.5 text-sm leading-relaxed soft-text break-words">{creator.identity}</p>
          <p className="mt-1 text-sm leading-relaxed soft-text break-words">{creator.positioning}</p>
        </div>

        <div className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface))] p-3">
          <p className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">Partnership angle</p>
          <p className="mt-1 text-sm leading-relaxed break-words">{creator.partnership}</p>
        </div>

        {/* Score: the three inputs beside the composite, never the composite alone. */}
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-[rgb(var(--muted)/0.45)] p-3">
          <div className="shrink-0">
            <p className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">Score</p>
            <p className="text-2xl font-semibold tabular-nums leading-tight">
              {creator.score.toFixed(2)}
            </p>
            <p className="text-[0.6rem] soft-text">computed</p>
          </div>
          <div className="min-w-[10rem] flex-1 space-y-1.5">
            <PipRow label="Fit" value={creator.fit} />
            <PipRow label="Reply" value={creator.reply_odds} />
            <PipRow label="Paid" value={creator.paid_odds} />
          </div>
        </div>

        {/* Contact — personal data. Never rendered outside this admin route. */}
        <div className="flex items-start gap-2 rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface))] p-3">
          <ChannelIcon className="mt-0.5 h-4 w-4 shrink-0 soft-text" />
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">
              Contact · {creator.channel}
            </p>
            <p className="mt-0.5 break-all text-sm">{creator.contact}</p>
            {creator.verify_note && (
              <p className="mt-1.5 flex items-start gap-1.5 text-xs text-[rgb(var(--error))]">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span className="break-words">{creator.verify_note}</span>
              </p>
            )}
          </div>
          <CopyButton value={creator.contact} label="contact" />
        </div>

        {/* Verification control. Setting "yes" clears the note server-side and
            writes a log row — it is what unlocks sending, so it leaves a trail. */}
        <div>
          <p className="mb-1.5 text-[0.65rem] uppercase tracking-[0.08em] soft-text">
            Verification — confirm on the person&apos;s own page first
          </p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Verification state">
            {VERIFICATION_STATES.map((state) => (
              <button
                key={state}
                type="button"
                disabled={busy}
                aria-pressed={creator.verified === state}
                onClick={() => onVerify(state, state === "yes" ? null : creator.verify_note)}
                className={cn(
                  "min-h-[2.25rem] flex-1 rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.06em] transition disabled:opacity-40",
                  creator.verified === state
                    ? state === "yes"
                      ? "border-[rgb(var(--success)/0.6)] bg-[rgb(var(--success)/0.14)] text-[rgb(var(--success))]"
                      : state === "partial"
                        ? "border-[rgb(var(--gold-line)/0.6)] bg-[rgb(var(--gold-line)/0.16)] text-[rgb(var(--gold-ink))]"
                        : "border-[rgb(var(--error)/0.6)] bg-[rgb(var(--error)/0.14)] text-[rgb(var(--error))]"
                    : "border-[rgb(var(--muted)/0.55)] text-[rgb(var(--text)/0.6)] hover:bg-[rgb(var(--text)/0.05)]"
                )}
              >
                {state}
              </button>
            ))}
          </div>
        </div>

        {/* Quick actions. A send button EXISTS only when the creator is verified
            and their wave is sending — an unverified contact has no send
            affordance anywhere in this UI, which is the whole point. */}
        {!parked && (
          <div className="flex flex-wrap gap-2">
            {sendable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onQuickAction("sent")}
                className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.6)] bg-[rgb(var(--accent)/0.08)] px-3 py-1.5 text-xs font-semibold text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.16)] disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
                Mark sent today
              </button>
            )}
            {followable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onQuickAction("followed_up")}
                className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg border border-[rgb(var(--muted)/0.6)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[rgb(var(--text)/0.06)] disabled:opacity-40"
              >
                <CornerUpRight className="h-3.5 w-3.5" />
                Followed up today
              </button>
            )}
            {replyable && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onQuickAction("replied")}
                className="inline-flex min-h-[2.25rem] items-center gap-1.5 rounded-lg border border-[rgb(var(--muted)/0.6)] px-3 py-1.5 text-xs font-semibold transition hover:bg-[rgb(var(--text)/0.06)] disabled:opacity-40"
              >
                <Reply className="h-3.5 w-3.5" />
                Replied today
              </button>
            )}
            {!sendable && creator.first_sent === null && (
              <p className="text-xs soft-text">
                {creator.verified !== "yes"
                  ? "No send action — contact unverified."
                  : waveHeld
                    ? `No send action — wave ${creator.wave} is held back.`
                    : "No send action for this stage."}
              </p>
            )}
          </div>
        )}

        {/* Editable record fields */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1">
            <span className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">Stage</span>
            <select
              disabled={busy}
              value={creator.stage}
              onChange={(e) => onPatch({ stage: e.target.value as Stage })}
              className={INPUT_CLASS}
            >
              {STAGES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col justify-end gap-1">
            <span className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">Followed up</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPatch({ followed_up: !creator.followed_up })}
              className={cn(
                INPUT_CLASS,
                "text-left transition",
                creator.followed_up && "border-[rgb(var(--accent)/0.5)] bg-[rgb(var(--accent)/0.08)]"
              )}
            >
              {creator.followed_up ? "Yes — one follow-up used" : "Not yet"}
            </button>
          </label>
          <InlineField
            label="First sent"
            type="date"
            value={creator.first_sent}
            disabled={busy}
            onCommit={(v) => onPatch({ first_sent: v })}
          />
          <InlineField
            label="Reply date"
            type="date"
            value={creator.reply_date}
            disabled={busy}
            onCommit={(v) => onPatch({ reply_date: v })}
          />
          <InlineField
            label="Last touch"
            type="date"
            value={creator.last_touch}
            disabled={busy}
            onCommit={(v) => onPatch({ last_touch: v })}
          />
          <InlineField
            label="Outcome"
            value={creator.outcome}
            placeholder="—"
            disabled={busy}
            onCommit={(v) => onPatch({ outcome: v })}
          />
          <div className="sm:col-span-2">
            <InlineField
              label="Notes"
              value={creator.notes}
              rows={3}
              placeholder="—"
              disabled={busy}
              onCommit={(v) => onPatch({ notes: v })}
            />
          </div>
        </div>

        {/* Stats — typed in by hand from Stripe and analytics. */}
        <div>
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <p className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">Tracking</p>
            <p className="text-[0.7rem] soft-text">
              commission owed{" "}
              <span className="font-semibold tabular-nums text-[rgb(var(--text))]">
                {formatUsd(creator.commission_owed)}
              </span>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatInput
              label="Clicks"
              value={creator.clicks}
              disabled={busy}
              onCommit={(v) => onPatch({ clicks: v })}
            />
            <StatInput
              label="Signups"
              value={creator.registrations}
              disabled={busy}
              onCommit={(v) => onPatch({ registrations: v })}
            />
            <StatInput
              label="Paid"
              value={creator.paid_count}
              disabled={busy}
              onCommit={(v) => onPatch({ paid_count: v })}
            />
            <StatInput
              label="Revenue"
              value={creator.revenue_usd}
              step={0.01}
              prefix="$"
              disabled={busy}
              onCommit={(v) => onPatch({ revenue_usd: v })}
            />
          </div>
        </div>

        {creator.sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">Sources</span>
            {creator.sources.map((src) => (
              <a
                key={src}
                href={src}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex max-w-full items-center gap-1 text-xs text-[rgb(var(--accent))] underline-offset-2 hover:underline"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{hostnameOf(src)}</span>
              </a>
            ))}
          </div>
        )}

        {/* Collapsible log */}
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
                    {entry.action && <Chip tone="neutral">{entry.action}</Chip>}
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

        <p className="text-[0.65rem] soft-text">
          Last touch {elapsedLabel(creator.days_since_last_touch)} ago · first sent{" "}
          {elapsedLabel(creator.days_since_first_sent)} ago
        </p>
      </div>
    </article>
  );
}
