"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  RefreshCcw,
  Trash2,
  X,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

type DurationChoice =
  | "1 day"
  | "3 days"
  | "1 week"
  | "2 weeks"
  | "1 month"
  | "forever";

type FrequencyChoice = "once" | "session" | "always";

type AnnouncementRecord = {
  id: string;
  enabled: boolean;
  duration: DurationChoice;
  frequency: FrequencyChoice;
  dismissible: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  titleZh: string;
  bodyZh: string;
  buttonLabelZh: string;
};

type FormState = {
  enabled: boolean;
  duration: DurationChoice;
  frequency: FrequencyChoice;
  dismissible: boolean;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  titleZh: string;
  bodyZh: string;
  buttonLabelZh: string;
};

const DURATION_OPTIONS: DurationChoice[] = [
  "1 day",
  "3 days",
  "1 week",
  "2 weeks",
  "1 month",
  "forever",
];

const FREQUENCY_OPTIONS: { value: FrequencyChoice; label: string; hint: string }[] = [
  { value: "once", label: "Once per user", hint: "Shown once, ever (default)" },
  { value: "session", label: "Once per session", hint: "Reappears next time they open the app" },
  { value: "always", label: "Every page load", hint: "Never auto-hidden client-side" },
];

const EMPTY_FORM: FormState = {
  enabled: true,
  duration: "1 week",
  frequency: "once",
  dismissible: true,
  title: "",
  body: "",
  buttonLabel: "",
  buttonUrl: "",
  titleZh: "",
  bodyZh: "",
  buttonLabelZh: "",
};

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() >= t;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
}

export function AnnouncementsManager({
  initialItems,
  initialReads = {},
  memberCount = 0,
}: {
  initialItems: AnnouncementRecord[];
  /** Per-announcement read counts, pre-loaded server-side. */
  initialReads?: Record<string, number>;
  /** Total member count, denominator for the reach % column. */
  memberCount?: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [reads, setReads] = useState<Record<string, number>>(initialReads);
  const [editing, setEditing] = useState<AnnouncementRecord | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const activeId = useMemo(() => {
    const live = items.find((i) => i.enabled && !isExpired(i.expiresAt));
    return live?.id ?? null;
  }, [items]);

  async function refresh() {
    const [listRes, readsRes] = await Promise.all([
      fetch("/api/admin/announcements", { cache: "no-store" }),
      fetch("/api/admin/announcements/reads", { cache: "no-store" }),
    ]);
    const listJson = await listRes.json();
    if (listJson?.ok && Array.isArray(listJson.items)) setItems(listJson.items);
    const readsJson = await readsRes.json().catch(() => null);
    if (readsJson?.ok && readsJson.reads) setReads(readsJson.reads);
  }

  async function toggleEnabled(item: AnnouncementRecord) {
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !item.enabled }),
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.message ?? "Update failed.");
      } else {
        setItems((prev) => prev.map((p) => (p.id === item.id ? json.item : p)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item: AnnouncementRecord) {
    if (!confirm(`Delete announcement “${item.title || item.titleZh || item.id}”?`)) return;
    setBusyId(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/announcements/${item.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.message ?? "Delete failed.");
      } else {
        setItems((prev) => prev.filter((p) => p.id !== item.id));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-sm font-medium">Live popup</p>
          <p className="mt-1 text-xs soft-text">
            The newest enabled, non-expired announcement is what every visitor sees.
            Editing keeps the same id so users who already dismissed it won&apos;t see it
            again — flip <em>Re-publish</em> to bump it back into everyone&apos;s view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => startTransition(refresh)}
            className="min-h-0 gap-1.5 px-3 py-1.5 text-xs"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
          <Button onClick={() => setEditing("new")} className="min-h-0 gap-1.5 px-3 py-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            New announcement
          </Button>
        </div>
      </Card>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600">
          {error}
        </div>
      )}

      {items.length === 0 ? (
        <Card className="p-6 text-center text-sm soft-text">
          Nothing published yet. Hit <strong>New announcement</strong> to create one.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          {/* Desktop / tablet — compact table. Reads + reach show how many
              unique viewers (logged-in deduped by user id, anon by
              localStorage uuid) have seen each one. */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="bg-[rgb(var(--bg-elev)/0.85)] text-left text-xs soft-text">
                <tr>
                  <th className="px-4 py-2.5">Title</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Frequency</th>
                  <th className="px-3 py-2.5">Reads</th>
                  <th className="px-3 py-2.5">Reach</th>
                  <th className="px-3 py-2.5">Published</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const expired = isExpired(item.expiresAt);
                  const isLive = item.id === activeId;
                  const readCount = reads[item.id] ?? 0;
                  const reach = memberCount > 0 ? Math.min(100, (readCount / memberCount) * 100) : 0;
                  return (
                    <tr key={item.id} className="border-t border-[rgb(var(--muted)/0.35)] align-top">
                      <td className="max-w-xs px-4 py-3">
                        <div className="truncate font-medium">
                          {item.title || item.titleZh || <span className="soft-text">(no title)</span>}
                        </div>
                        {item.body && (
                          <div className="mt-0.5 truncate text-xs soft-text">{item.body}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill isLive={isLive} enabled={item.enabled} expired={expired} />
                      </td>
                      <td className="px-3 py-3 text-xs soft-text">
                        <div>{item.frequency}</div>
                        <div className="mt-0.5 opacity-70">{item.duration}</div>
                      </td>
                      <td className="px-3 py-3">
                        <span className="num-display font-semibold">{readCount.toLocaleString()}</span>
                      </td>
                      <td className="px-3 py-3">
                        <ReachBar percent={reach} />
                      </td>
                      <td className="num-display whitespace-nowrap px-3 py-3 text-xs soft-text">
                        {formatDate(item.publishedAt)}
                        {item.expiresAt ? (
                          <div className="mt-0.5 opacity-70">expires {formatDate(item.expiresAt)}</div>
                        ) : (
                          <div className="mt-0.5 opacity-70">no expiry</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex shrink-0 items-center justify-end gap-1.5">
                          <IconButton
                            label={item.enabled ? "Take down" : "Re-enable"}
                            busy={busyId === item.id}
                            onClick={() => toggleEnabled(item)}
                            icon={item.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                          />
                          <IconButton
                            label="Edit"
                            onClick={() => setEditing(item)}
                            icon={<Pencil className="h-4 w-4" />}
                          />
                          <IconButton
                            label="Delete"
                            busy={busyId === item.id}
                            onClick={() => remove(item)}
                            icon={<Trash2 className="h-4 w-4" />}
                            tone="danger"
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile — same data as cards (table is unreadable in a 360px viewport). */}
          <ol className="divide-y divide-[rgb(var(--muted)/0.35)] md:hidden">
            {items.map((item) => {
              const expired = isExpired(item.expiresAt);
              const isLive = item.id === activeId;
              const readCount = reads[item.id] ?? 0;
              const reach = memberCount > 0 ? Math.min(100, (readCount / memberCount) * 100) : 0;
              return (
                <li key={item.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill isLive={isLive} enabled={item.enabled} expired={expired} />
                        <span className="text-[0.65rem] uppercase tracking-[0.12em] soft-text">
                          {item.frequency} · {item.duration}
                        </span>
                      </div>
                      <h3 className="mt-1.5 truncate text-base font-semibold tracking-tight">
                        {item.title || item.titleZh || <span className="soft-text">(no title)</span>}
                      </h3>
                      {item.body && <p className="mt-1 line-clamp-2 text-sm soft-text">{item.body}</p>}
                      <div className="mt-2 flex items-center gap-2 text-xs soft-text">
                        <Eye className="h-3 w-3" />
                        <span className="num-display font-semibold text-[rgb(var(--text))]">
                          {readCount.toLocaleString()}
                        </span>
                        <span>reads</span>
                        {memberCount > 0 && (
                          <span className="opacity-70">· {Math.round(reach)}% of members</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-xs soft-text">Published {formatDate(item.publishedAt)}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1.5">
                      <IconButton
                        label={item.enabled ? "Take down" : "Re-enable"}
                        busy={busyId === item.id}
                        onClick={() => toggleEnabled(item)}
                        icon={item.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      />
                      <IconButton
                        label="Edit"
                        onClick={() => setEditing(item)}
                        icon={<Pencil className="h-4 w-4" />}
                      />
                      <IconButton
                        label="Delete"
                        busy={busyId === item.id}
                        onClick={() => remove(item)}
                        icon={<Trash2 className="h-4 w-4" />}
                        tone="danger"
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {editing && (
        <AnnouncementEditor
          initial={editing === "new" ? null : editing}
          onClose={(saved) => {
            setEditing(null);
            if (saved) {
              setItems((prev) => {
                const idx = prev.findIndex((p) => p.id === saved.id);
                if (idx >= 0) {
                  const copy = prev.slice();
                  copy[idx] = saved;
                  return copy;
                }
                return [saved, ...prev];
              });
            }
          }}
        />
      )}
    </section>
  );
}

function AnnouncementEditor({
  initial,
  onClose,
}: {
  initial: AnnouncementRecord | null;
  onClose: (saved: AnnouncementRecord | null) => void;
}) {
  const isEdit = Boolean(initial);
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          enabled: initial.enabled,
          duration: initial.duration,
          frequency: initial.frequency,
          dismissible: initial.dismissible,
          title: initial.title,
          body: initial.body,
          buttonLabel: initial.buttonLabel,
          buttonUrl: initial.buttonUrl,
          titleZh: initial.titleZh,
          bodyZh: initial.bodyZh,
          buttonLabelZh: initial.buttonLabelZh,
        }
      : EMPTY_FORM
  );
  const [extendExpiry, setExtendExpiry] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save() {
    if (!form.title.trim() && !form.titleZh.trim()) {
      setErr("Provide a title (English or 中文).");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(
        isEdit ? `/api/admin/announcements/${initial!.id}` : "/api/admin/announcements",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(isEdit ? { ...form, extendExpiry } : form),
        }
      );
      const json = await res.json();
      if (!json?.ok) {
        setErr(json?.message ?? "Save failed.");
      } else {
        onClose(json.item);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Network error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={() => onClose(null)}
      title=""
      zIndexClass="z-[120]"
      maxWidthClass="max-w-2xl"
    >
      <div className="relative flex max-h-[80vh] w-full flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[rgb(var(--glass-stroke-soft)/0.4)] pb-3">
          <div>
            <p className="t-eyebrow">Announcement</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">
              {isEdit ? "Edit announcement" : "New announcement"}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onClose(null)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--text)/0.6)] transition hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide soft-text">
                Duration
              </span>
              <select
                value={form.duration}
                onChange={(e) => setField("duration", e.target.value as DurationChoice)}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.6)] bg-[rgb(var(--bg-elev)/0.65)] px-3 py-2 text-sm"
              >
                {DURATION_OPTIONS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[0.7rem] soft-text">Auto-hide after this period.</span>
            </label>
            <label className="text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide soft-text">
                Frequency
              </span>
              <select
                value={form.frequency}
                onChange={(e) => setField("frequency", e.target.value as FrequencyChoice)}
                className="mt-1 w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.6)] bg-[rgb(var(--bg-elev)/0.65)] px-3 py-2 text-sm"
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[0.7rem] soft-text">
                {FREQUENCY_OPTIONS.find((f) => f.value === form.frequency)?.hint}
              </span>
            </label>
          </div>

          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => setField("enabled", e.target.checked)}
              />
              <span>Enabled (show to visitors)</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.dismissible}
                onChange={(e) => setField("dismissible", e.target.checked)}
              />
              <span>Dismissible</span>
            </label>
            {isEdit && (
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={extendExpiry}
                  onChange={(e) => setExtendExpiry(e.target.checked)}
                />
                <span>Re-publish (reset expiry from now)</span>
              </label>
            )}
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <fieldset className="space-y-3 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.4)] p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide soft-text">
                English
              </legend>
              <LabeledInput
                label="Title"
                value={form.title}
                onChange={(v) => setField("title", v)}
                placeholder="Android App Available"
              />
              <LabeledTextarea
                label="Body"
                value={form.body}
                onChange={(v) => setField("body", v)}
                placeholder="The Android App is now available"
              />
              <LabeledInput
                label="Button label"
                value={form.buttonLabel}
                onChange={(v) => setField("buttonLabel", v)}
                placeholder="Go to Download Page"
              />
            </fieldset>
            <fieldset className="space-y-3 rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.4)] p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide soft-text">
                中文 (optional)
              </legend>
              <LabeledInput
                label="标题"
                value={form.titleZh}
                onChange={(v) => setField("titleZh", v)}
                placeholder="留空时回退到英文"
              />
              <LabeledTextarea
                label="正文"
                value={form.bodyZh}
                onChange={(v) => setField("bodyZh", v)}
              />
              <LabeledInput
                label="按钮文案"
                value={form.buttonLabelZh}
                onChange={(v) => setField("buttonLabelZh", v)}
              />
            </fieldset>
          </div>

          <LabeledInput
            label="Button URL (applies to both languages)"
            value={form.buttonUrl}
            onChange={(v) => setField("buttonUrl", v)}
            placeholder="/download or https://…"
          />

          {err && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600">
              {err}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[rgb(var(--glass-stroke-soft)/0.4)] pt-3">
          <Button variant="secondary" onClick={() => onClose(null)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save changes" : "Publish"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-semibold uppercase tracking-wide soft-text">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.6)] bg-[rgb(var(--bg-elev)/0.65)] px-3 py-2 text-sm placeholder:text-[rgb(var(--text)/0.35)]"
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="block text-xs font-semibold uppercase tracking-wide soft-text">{label}</span>
      <textarea
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full resize-y rounded-lg border border-[rgb(var(--glass-stroke-soft)/0.6)] bg-[rgb(var(--bg-elev)/0.65)] px-3 py-2 text-sm placeholder:text-[rgb(var(--text)/0.35)]"
      />
    </label>
  );
}

function StatusPill({
  isLive,
  enabled,
  expired,
}: {
  isLive: boolean;
  enabled: boolean;
  expired: boolean;
}) {
  if (isLive) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-600">
        <CheckCircle2 className="h-3 w-3" />
        Live
      </span>
    );
  }
  if (!enabled) {
    return (
      <span className="rounded-full bg-[rgb(var(--text)/0.06)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[rgb(var(--text)/0.55)]">
        Disabled
      </span>
    );
  }
  if (expired) {
    return (
      <span className="rounded-full bg-[rgb(var(--text)/0.06)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[rgb(var(--text)/0.55)]">
        Expired
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[rgb(var(--accent)/0.18)] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[rgb(var(--accent))]">
      Queued
    </span>
  );
}

function ReachBar({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex w-28 items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[rgb(var(--text)/0.08)]">
        <div
          className="h-full rounded-full bg-[rgb(var(--accent))]"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <span className="num-display w-10 shrink-0 text-right text-[0.7rem] tabular-nums soft-text">
        {pct < 1 ? pct.toFixed(1) : Math.round(pct)}%
      </span>
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  busy,
  tone,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  tone?: "danger";
}) {
  const tonal =
    tone === "danger"
      ? "border-red-500/30 text-red-600 hover:bg-red-500/10"
      : "border-[rgb(var(--glass-stroke-soft)/0.5)] text-[rgb(var(--text)/0.7)] hover:bg-[rgb(var(--text)/0.06)]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition disabled:opacity-50 ${tonal}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
    </button>
  );
}
