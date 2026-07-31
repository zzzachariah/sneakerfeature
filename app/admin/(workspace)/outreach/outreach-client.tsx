"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  CornerUpRight,
  PauseCircle,
  Reply,
  Send,
  ShieldQuestion,
  X
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildFunnel,
  buildQueue,
  deriveIsParked,
  type ActionType
} from "@/lib/outreach/queue";
import { WAVES } from "@/lib/outreach/types";
import type {
  OutreachChannelView,
  OutreachCreatorView,
  OutreachLogEntry,
  OutreachSettings,
  VerificationState
} from "@/lib/outreach/types";
import { CreatorCard } from "./creator-card";
import { ChannelCard } from "./channel-card";
import { Chip, Section, elapsedLabel, formatUsd } from "./outreach-ui";

const ACTION_META: Record<
  ActionType,
  { label: string; icon: typeof Send; tone: "error" | "accent" | "warn" | "neutral" }
> = {
  verify: { label: "Verify", icon: ShieldQuestion, tone: "error" },
  send: { label: "Send", icon: Send, tone: "accent" },
  follow: { label: "Follow up", icon: CornerUpRight, tone: "warn" },
  nudge: { label: "Nudge", icon: Reply, tone: "warn" },
  parked: { label: "Parked", icon: PauseCircle, tone: "neutral" }
};

const SECTIONS = [
  { id: "queue", label: "Do next" },
  { id: "funnel", label: "Funnel" },
  { id: "wave-A", label: "Wave A" },
  { id: "wave-B", label: "Wave B" },
  { id: "wave-C", label: "Wave C" },
  { id: "channels", label: "Channels" },
  { id: "rules", label: "House rules" }
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OutreachClient({
  initialCreators,
  initialChannels,
  initialLogsByCreator,
  initialLogsByChannel,
  settings
}: {
  initialCreators: OutreachCreatorView[];
  initialChannels: OutreachChannelView[];
  initialLogsByCreator: Record<number, OutreachLogEntry[]>;
  initialLogsByChannel: Record<string, OutreachLogEntry[]>;
  settings: OutreachSettings;
}) {
  const router = useRouter();
  const [creators, setCreators] = useState(initialCreators);
  const [channels, setChannels] = useState(initialChannels);
  const [logsByCreator, setLogsByCreator] = useState(initialLogsByCreator);
  const [logsByChannel, setLogsByChannel] = useState(initialLogsByChannel);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // router.refresh() re-runs the server component; adopt its rows as truth,
  // replacing whatever the optimistic update guessed.
  useEffect(() => setCreators(initialCreators), [initialCreators]);
  useEffect(() => setChannels(initialChannels), [initialChannels]);
  useEffect(() => setLogsByCreator(initialLogsByCreator), [initialLogsByCreator]);
  useEffect(() => setLogsByChannel(initialLogsByChannel), [initialLogsByChannel]);

  const unverified = useMemo(() => creators.filter((c) => c.verified !== "yes"), [creators]);
  const queue = useMemo(() => buildQueue(creators, settings), [creators, settings]);
  const funnel = useMemo(
    () => buildFunnel(creators, channels, settings),
    [creators, channels, settings]
  );

  async function send(
    key: string,
    request: () => Promise<Response>,
    rollback: () => void
  ): Promise<void> {
    setBusyKey(key);
    setError(null);
    try {
      const res = await request();
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !json.ok) {
        rollback();
        setError(json.message ?? "That didn't save. Nothing was changed.");
        return;
      }
      router.refresh();
    } catch {
      rollback();
      setError("Network error — nothing was saved.");
    } finally {
      setBusyKey(null);
    }
  }

  function patchCreator(id: number, fields: Record<string, unknown>) {
    const before = creators;
    setCreators((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...fields } as OutreachCreatorView;
        if ("revenue_usd" in fields) {
          next.commission_owed = next.revenue_usd * settings.commission_rate;
        }
        next.is_parked = deriveIsParked(next);
        return next;
      })
    );
    void send(
      `creator-${id}`,
      () =>
        fetch(`/api/admin/outreach/creators/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields)
        }),
      () => setCreators(before)
    );
  }

  function quickAction(id: number, action: "sent" | "followed_up" | "replied") {
    const before = creators;
    const beforeLogs = logsByCreator;
    const day = today();

    setCreators((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c };
        if (action === "sent") {
          next.stage = "sent";
          next.first_sent = c.first_sent ?? day;
          next.last_touch = day;
          next.days_since_first_sent = c.first_sent ? c.days_since_first_sent : 0;
          next.days_since_last_touch = 0;
        } else if (action === "followed_up") {
          next.followed_up = true;
          next.last_touch = day;
          next.days_since_last_touch = 0;
        } else {
          next.stage = ["talking", "live", "closed"].includes(c.stage) ? c.stage : "replied";
          next.reply_date = c.reply_date ?? day;
          next.last_touch = day;
          next.days_since_last_touch = 0;
        }
        next.is_parked = deriveIsParked(next);
        return next;
      })
    );
    setLogsByCreator((prev) => ({
      ...prev,
      [id]: [
        {
          // Negative id: a placeholder that can't collide with a real bigserial.
          // Replaced wholesale by the refresh.
          id: -Date.now(),
          creator_id: id,
          channel_id: null,
          entry_date: day,
          action,
          note: "",
          created_at: new Date().toISOString()
        },
        ...(prev[id] ?? [])
      ]
    }));

    void send(
      `creator-${id}`,
      () =>
        fetch(`/api/admin/outreach/creators/${id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action })
        }),
      () => {
        setCreators(before);
        setLogsByCreator(beforeLogs);
      }
    );
  }

  function verifyCreator(id: number, verified: VerificationState, note: string | null) {
    const before = creators;
    setCreators((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, verified, verify_note: verified === "yes" ? null : note } : c
      )
    );
    void send(
      `creator-${id}`,
      () =>
        fetch(`/api/admin/outreach/creators/${id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "verify", verified, verify_note: note })
        }),
      () => setCreators(before)
    );
  }

  function patchChannel(id: string, fields: Record<string, unknown>) {
    const before = channels;
    setChannels((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const next = { ...c, ...fields } as OutreachChannelView;
        if ("revenue_usd" in fields) {
          next.commission_owed = next.revenue_usd * settings.commission_rate;
        }
        return next;
      })
    );
    void send(
      `channel-${id}`,
      () =>
        fetch(`/api/admin/outreach/channels/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(fields)
        }),
      () => setChannels(before)
    );
  }

  function addLog(target: { creatorId?: number; channelId?: string }, entryDate: string, note: string) {
    const optimistic: OutreachLogEntry = {
      id: -Date.now(),
      creator_id: target.creatorId ?? null,
      channel_id: target.channelId ?? null,
      entry_date: entryDate,
      action: null,
      note,
      created_at: new Date().toISOString()
    };
    const beforeCreatorLogs = logsByCreator;
    const beforeChannelLogs = logsByChannel;

    if (target.creatorId !== undefined) {
      setLogsByCreator((prev) => ({
        ...prev,
        [target.creatorId as number]: [optimistic, ...(prev[target.creatorId as number] ?? [])]
      }));
    } else if (target.channelId !== undefined) {
      setLogsByChannel((prev) => ({
        ...prev,
        [target.channelId as string]: [optimistic, ...(prev[target.channelId as string] ?? [])]
      }));
    }

    void send(
      target.creatorId !== undefined ? `creator-${target.creatorId}` : `channel-${target.channelId}`,
      () =>
        fetch("/api/admin/outreach/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creator_id: target.creatorId ?? null,
            channel_id: target.channelId ?? null,
            entry_date: entryDate,
            note
          })
        }),
      () => {
        setLogsByCreator(beforeCreatorLogs);
        setLogsByChannel(beforeChannelLogs);
      }
    );
  }

  const allVerified = unverified.length === 0;

  return (
    <div className="space-y-4 pb-[var(--mobile-nav-h)]">
      {/* 1 — Verification gate. The loudest thing on the page: it is what
          stands between the operator and emailing a guessed address. */}
      <section
        className={cn(
          "rounded-2xl border-2 p-4 sm:p-5",
          allVerified
            ? "border-[rgb(var(--success)/0.5)] bg-[rgb(var(--success)/0.1)]"
            : "border-[rgb(var(--error)/0.55)] bg-[rgb(var(--error)/0.1)]"
        )}
      >
        <div className="flex items-start gap-3">
          {allVerified ? (
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[rgb(var(--success))]" />
          ) : (
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-[rgb(var(--error))]" />
          )}
          <div className="min-w-0 flex-1">
            <h2
              className={cn(
                "text-lg font-bold uppercase tracking-[0.02em] sm:text-xl",
                allVerified ? "text-[rgb(var(--success))]" : "text-[rgb(var(--error))]"
              )}
            >
              {allVerified
                ? `All ${creators.length} contacts verified`
                : `${unverified.length} of ${creators.length} contacts unverified`}
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed">
              {allVerified
                ? "Every contact has been confirmed on the person's own page. Sending is unblocked for the active waves."
                : "Every contact here was constructed from public pages, not confirmed on them. One known address appears nowhere public. Open the person's own page and check before sending — a wrong email bounces; a wrong WeChat ID means adding a stranger."}
            </p>
            {!allVerified && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {unverified.map((c) => (
                  <li key={c.id}>
                    <a
                      href={`#creator-${c.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--error)/0.4)] bg-[rgb(var(--bg-elev)/0.6)] px-2.5 py-1.5 text-xs font-medium transition hover:bg-[rgb(var(--bg-elev))]"
                    >
                      <span className="break-words">{c.name}</span>
                      <Chip tone={c.verified === "partial" ? "warn" : "error"}>{c.verified}</Chip>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Jump bar — horizontal scroll on a phone, no sticky positioning so it
          can never collide with the admin top bar or the bottom tab capsule. */}
      <nav
        aria-label="Sections"
        className="surface-card premium-border -mx-1 flex gap-1.5 overflow-x-auto rounded-2xl p-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium soft-text transition hover:bg-[rgb(var(--text)/0.06)] hover:text-[rgb(var(--text))]"
          >
            {s.label}
          </a>
        ))}
      </nav>

      {/* 2 — Do Next */}
      <div id="queue" className="scroll-mt-36 lg:scroll-mt-24">
        <Section
          title="Do next"
          count={`${queue.length} ${queue.length === 1 ? "line" : "lines"}`}
          description="One line per creator, highest priority first."
        >
          {queue.length === 0 ? (
            <p className="text-sm soft-text">Nothing to do — no creator currently produces an action.</p>
          ) : (
            <ol className="space-y-1.5">
              {queue.map((line, index) => {
                const meta = ACTION_META[line.action];
                const Icon = meta.icon;
                return (
                  <li key={line.creator.id}>
                    <a
                      href={`#creator-${line.creator.id}`}
                      className={cn(
                        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-[rgb(var(--muted)/0.45)] p-2.5 transition hover:bg-[rgb(var(--text)/0.04)]",
                        line.action === "parked" && "opacity-60"
                      )}
                    >
                      <span className="w-6 shrink-0 text-center text-xs font-semibold tabular-nums soft-text">
                        {index + 1}
                      </span>
                      <Chip tone={meta.tone}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Chip>
                      <span className="min-w-0 break-words text-sm font-medium">
                        {line.creator.name}
                      </span>
                      <span className="text-xs tabular-nums soft-text">
                        {line.elapsedDays === null ? `wave ${line.creator.wave}` : elapsedLabel(line.elapsedDays)}
                      </span>
                      <span className="w-full break-words text-xs soft-text sm:w-auto sm:flex-1">
                        {line.reason}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      </div>

      {/* 3 — Funnel */}
      <div id="funnel" className="scroll-mt-36 lg:scroll-mt-24">
        <Section title="Funnel" description="Creators and growth channels combined.">
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Sent", value: String(funnel.sent) },
              { label: "Replies", value: String(funnel.replies) },
              { label: "Clicks", value: funnel.clicks.toLocaleString() },
              { label: "Signups", value: funnel.registrations.toLocaleString() },
              { label: "Paid", value: funnel.paid.toLocaleString() },
              {
                label: "Reg → paid",
                value: funnel.regToPaidPct === null ? "—" : `${funnel.regToPaidPct.toFixed(1)}%`
              },
              { label: "Revenue", value: formatUsd(funnel.revenue) },
              { label: "Commission owed", value: formatUsd(funnel.commissionOwed) }
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface))] p-3"
              >
                <dt className="text-[0.65rem] uppercase tracking-[0.08em] soft-text">{stat.label}</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      {/* 4 — Waves, sorted by computed score descending */}
      {WAVES.map((wave) => {
        const inWave = creators
          .filter((c) => c.wave === wave)
          .sort((a, b) => b.score - a.score);
        if (inWave.length === 0) return null;
        const sending = settings.sending_waves.includes(wave);
        return (
          <div key={wave} id={`wave-${wave}`} className="scroll-mt-36 lg:scroll-mt-24">
            <Section
              title={`Wave ${wave}`}
              count={`${inWave.length}`}
              description={sending ? "Sending is active for this wave." : "Held back — produces no send actions."}
            >
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {inWave.map((creator) => (
                  <div key={creator.id} id={`creator-${creator.id}`} className="scroll-mt-36 lg:scroll-mt-24">
                    <CreatorCard
                      creator={creator}
                      settings={settings}
                      logs={logsByCreator[creator.id] ?? []}
                      busy={busyKey === `creator-${creator.id}`}
                      onPatch={(fields) => patchCreator(creator.id, fields)}
                      onQuickAction={(action) => quickAction(creator.id, action)}
                      onVerify={(verified, note) => verifyCreator(creator.id, verified, note)}
                      onAddLog={(date, note) => addLog({ creatorId: creator.id }, date, note)}
                    />
                  </div>
                ))}
              </div>
            </Section>
          </div>
        );
      })}

      {/* 5 — Growth channels */}
      <div id="channels" className="scroll-mt-36 lg:scroll-mt-24">
        <Section
          title="Growth channels"
          count={`${channels.length}`}
          description="Where the volume lives. This list buys trust; these buy traffic."
        >
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {channels.map((channel) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                settings={settings}
                logs={logsByChannel[channel.id] ?? []}
                busy={busyKey === `channel-${channel.id}`}
                onPatch={(fields) => patchChannel(channel.id, fields)}
                onAddLog={(date, note) => addLog({ channelId: channel.id }, date, note)}
              />
            ))}
          </div>
        </Section>
      </div>

      {/* 6 — House rules, read-only */}
      <div id="rules" className="scroll-mt-36 lg:scroll-mt-24">
        <Section title="House rules" description="Read-only. Change them in a migration.">
          <ol className="space-y-2.5">
            {settings.house_rules.map((rule, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--surface))] p-3"
              >
                <span className="shrink-0 text-sm font-semibold tabular-nums soft-text">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="min-w-0 break-words text-sm leading-relaxed">{rule}</p>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      {/* Failure toast. Fixed above the mobile tab capsule so it never sits
          under it — --mobile-nav-h is 0 on desktop, so this just docks to the
          bottom there. */}
      {error && (
        <div
          role="alert"
          className="fixed inset-x-3 z-40 mx-auto max-w-md rounded-xl border border-[rgb(var(--error)/0.5)] bg-[rgb(var(--bg-elev))] p-3 shadow-lift sm:inset-x-auto sm:right-6"
          style={{ bottom: "calc(var(--mobile-nav-h) + 1rem)" }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--error))]" />
            <p className="min-w-0 flex-1 break-words text-sm">{error}</p>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setError(null)}
              className="shrink-0 rounded-lg p-1 transition hover:bg-[rgb(var(--text)/0.08)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
