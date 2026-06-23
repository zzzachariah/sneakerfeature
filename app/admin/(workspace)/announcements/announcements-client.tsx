"use client";

import { useCallback, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Megaphone, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/native/native-menu";

type Frequency = "once" | "session" | "always";
type Duration = "1 day" | "3 days" | "1 week" | "2 weeks" | "1 month" | "forever";

type Announcement = {
  id: string;
  enabled: boolean;
  frequency: Frequency;
  dismissible: boolean;
  publishedAt: string | null;
  expiresAt: string | null;
  duration?: string;
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  titleZh: string;
  bodyZh: string;
  buttonLabelZh: string;
};

type FormState = {
  title: string;
  body: string;
  buttonLabel: string;
  buttonUrl: string;
  titleZh: string;
  bodyZh: string;
  buttonLabelZh: string;
  duration: Duration;
  frequency: Frequency;
  dismissible: boolean;
};

const DEFAULT_DURATION: Duration = "1 week";
const DEFAULT_FREQUENCY: Frequency = "once";

const DURATIONS: Duration[] = ["1 day", "3 days", "1 week", "2 weeks", "1 month", "forever"];
const FREQUENCIES: Array<{ value: Frequency; label: string }> = [
  { value: "once", label: "once — show once per user, ever" },
  { value: "session", label: "session — once each time they open the site/app" },
  { value: "always", label: "always — every page load" }
];

function emptyForm(): FormState {
  return {
    title: "",
    body: "",
    buttonLabel: "",
    buttonUrl: "",
    titleZh: "",
    bodyZh: "",
    buttonLabelZh: "",
    duration: DEFAULT_DURATION,
    frequency: DEFAULT_FREQUENCY,
    dismissible: true
  };
}

function fromAnnouncement(a: Announcement): FormState {
  const duration = (a.duration && DURATIONS.includes(a.duration as Duration)
    ? (a.duration as Duration)
    : DEFAULT_DURATION) as Duration;
  return {
    title: a.title,
    body: a.body,
    buttonLabel: a.buttonLabel,
    buttonUrl: a.buttonUrl,
    titleZh: a.titleZh,
    bodyZh: a.bodyZh,
    buttonLabelZh: a.buttonLabelZh,
    duration,
    frequency: a.frequency,
    dismissible: a.dismissible
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "—";
  return new Date(ts).toLocaleString();
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() >= t;
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
};

function TextField({ label, value, onChange, placeholder, rows, hint }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[rgb(var(--text)/0.7)]">{label}</span>
      {rows ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--muted)/0.5)] bg-transparent px-3 py-2 text-sm"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="mt-1 w-full rounded-lg border border-[rgb(var(--muted)/0.5)] bg-transparent px-3 py-2 text-sm"
        />
      )}
      {hint ? <span className="mt-1 block text-[11px] soft-text">{hint}</span> : null}
    </label>
  );
}

function FormBody({
  form,
  setForm
}: {
  form: FormState;
  setForm: (next: FormState) => void;
}) {
  const update = <K extends keyof FormState>(k: K) => (v: FormState[K]) =>
    setForm({ ...form, [k]: v });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Title (English)"
          value={form.title}
          onChange={update("title")}
          placeholder="e.g. iOS App now available"
        />
        <TextField
          label="标题 (中文) — optional"
          value={form.titleZh}
          onChange={update("titleZh")}
          placeholder="留空则展示英文标题"
        />
      </div>
      <TextField
        label="Body (English)"
        value={form.body}
        onChange={update("body")}
        placeholder="Plain text. Line breaks are preserved."
        rows={4}
      />
      <TextField
        label="正文 (中文) — optional"
        value={form.bodyZh}
        onChange={update("bodyZh")}
        placeholder="留空则展示英文正文"
        rows={4}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="Button label (English) — optional"
          value={form.buttonLabel}
          onChange={update("buttonLabel")}
          placeholder="e.g. Go to download page"
        />
        <TextField
          label="按钮文字 (中文) — optional"
          value={form.buttonLabelZh}
          onChange={update("buttonLabelZh")}
        />
      </div>
      <TextField
        label="Button URL — optional"
        value={form.buttonUrl}
        onChange={update("buttonUrl")}
        placeholder="https://… or /download"
        hint="Leave the URL and label blank for no button."
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="block text-xs font-semibold text-[rgb(var(--text)/0.7)]">
            Auto-hide after
          </span>
          <select
            value={form.duration}
            onChange={(e) => update("duration")(e.target.value as Duration)}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--muted)/0.5)] bg-transparent px-3 py-2 text-sm"
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs font-semibold text-[rgb(var(--text)/0.7)]">
            Frequency
          </span>
          <select
            value={form.frequency}
            onChange={(e) => update("frequency")(e.target.value as Frequency)}
            className="mt-1 w-full rounded-lg border border-[rgb(var(--muted)/0.5)] bg-transparent px-3 py-2 text-sm"
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.dismissible}
          onChange={(e) => update("dismissible")(e.target.checked)}
        />
        Let users close it
      </label>
    </div>
  );
}

type Props = {
  initialCurrent: Announcement | null;
  initialHistory: Announcement[];
};

export function AnnouncementsAdmin({ initialCurrent, initialHistory }: Props) {
  const [current, setCurrent] = useState<Announcement | null>(initialCurrent);
  const [history, setHistory] = useState<Announcement[]>(initialHistory);

  const [editForm, setEditForm] = useState<FormState>(() =>
    initialCurrent ? fromAnnouncement(initialCurrent) : emptyForm()
  );
  const [newForm, setNewForm] = useState<FormState>(() => emptyForm());

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/announcements", { cache: "no-store" });
    const json = await res.json();
    if (json?.ok) {
      setCurrent(json.current ?? null);
      setHistory(Array.isArray(json.history) ? (json.history as Announcement[]) : []);
    }
  }, []);

  const callApi = useCallback(
    async (payload: unknown, successText: string) => {
      setBusy(true);
      setMessage(null);
      try {
        const res = await fetch("/api/admin/announcements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const json = await res.json();
        if (!json?.ok) {
          setMessage(json?.message ?? "Failed.");
          return false;
        }
        setMessage(successText);
        await refresh();
        return true;
      } catch (e) {
        setMessage(e instanceof Error ? e.message : "Network error.");
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  const saveEdits = useCallback(async () => {
    if (!editForm.title.trim() || !editForm.body.trim()) {
      setMessage("Title and body are required.");
      return;
    }
    await callApi(
      { action: "update_current", ...editForm },
      "Saved. The live popup will pick up edits on the next poll."
    );
  }, [editForm, callApi]);

  const publishNew = useCallback(async () => {
    if (!newForm.title.trim() || !newForm.body.trim()) {
      setMessage("Title and body are required.");
      return;
    }
    if (
      !(await confirmDialog({
        message:
          "Publish this as a new announcement? It will replace the currently-live popup and re-pop for everyone (frequency permitting).",
        okLabel: "Publish",
        destructive: false
      }))
    )
      return;
    const ok = await callApi(
      { action: "publish", ...newForm },
      "Published. The popup will reach everyone within ~5 minutes."
    );
    if (ok) setNewForm(emptyForm());
  }, [newForm, callApi]);

  const takedown = useCallback(async () => {
    if (
      !(await confirmDialog({
        message:
          "Take down the live popup? The text stays in the archive — you can re-enable it by editing the current announcement.",
        okLabel: "Take down",
        destructive: true
      }))
    )
      return;
    await callApi({ action: "takedown" }, "Taken down.");
  }, [callApi]);

  const updateHistoryRow = useCallback(
    async (id: string, form: FormState) => {
      if (!form.title.trim() || !form.body.trim()) {
        setMessage("Title and body are required.");
        return;
      }
      await callApi(
        { action: "update_history", id, ...form },
        "History entry updated."
      );
    },
    [callApi]
  );

  const deleteHistoryRow = useCallback(
    async (id: string) => {
      if (
        !(await confirmDialog({
          message: "Delete this archive entry? It will disappear from /announcements.",
          okLabel: "Delete",
          destructive: true
        }))
      )
        return;
      await callApi({ action: "delete_history", id }, "Deleted.");
    },
    [callApi]
  );

  const currentStatus = useMemo(() => {
    if (!current) return { label: "No announcement set", live: false };
    if (!current.enabled) return { label: "Disabled — popup not showing", live: false };
    if (isExpired(current.expiresAt)) return { label: "Expired — popup auto-hidden", live: false };
    return { label: "Live — visitors see this popup", live: true };
  }, [current]);

  return (
    <div className="space-y-6">
      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Current popup</p>
            <p className="mt-1 text-xs soft-text">
              Edit the text or settings of the announcement that&apos;s active right now.
              Edits keep the same id, so users who already dismissed it won&apos;t see it again.
              To re-pop for everyone, use &ldquo;Publish new&rdquo; below.
            </p>
            <p className="mt-2 text-xs">
              Status:{" "}
              <span
                className={
                  currentStatus.live
                    ? "font-semibold text-emerald-600"
                    : "font-semibold text-amber-600"
                }
              >
                {currentStatus.label}
              </span>
            </p>
            {current ? (
              <p className="mt-1 text-[11px] soft-text">
                Published {formatDate(current.publishedAt)} · Expires{" "}
                {current.expiresAt ? formatDate(current.expiresAt) : "never"} · id {current.id}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {current?.enabled ? (
              <Button variant="secondary" onClick={takedown} disabled={busy}>
                Take down
              </Button>
            ) : null}
            <Button onClick={saveEdits} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save edits"}
            </Button>
          </div>
        </div>
        <FormBody form={editForm} setForm={setEditForm} />
      </Card>

      <Card className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Publish new announcement</p>
            <p className="mt-1 text-xs soft-text">
              Replaces the current popup with a fresh entry (new id). Pops for everyone
              the next time they load the site — even users who dismissed the previous one.
            </p>
          </div>
          <Button onClick={publishNew} disabled={busy}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Plus className="mr-1 h-4 w-4" /> Publish
              </>
            )}
          </Button>
        </div>
        <FormBody form={newForm} setForm={setNewForm} />
      </Card>

      {message ? <p className="text-sm">{message}</p> : null}

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-[rgb(var(--accent))]" />
          <p className="text-sm font-semibold">Archive ({history.length})</p>
        </div>
        <p className="mt-1 text-xs soft-text">
          Every entry shown on the public <code>/announcements</code> page, newest first.
        </p>

        {history.length === 0 ? (
          <p className="mt-3 text-sm soft-text">No archived announcements yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {history.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                expanded={expandedHistoryId === entry.id}
                onToggle={() =>
                  setExpandedHistoryId((id) => (id === entry.id ? null : entry.id))
                }
                onSave={(form) => updateHistoryRow(entry.id, form)}
                onDelete={() => deleteHistoryRow(entry.id)}
                busy={busy}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function HistoryRow({
  entry,
  expanded,
  onToggle,
  onSave,
  onDelete,
  busy
}: {
  entry: Announcement;
  expanded: boolean;
  onToggle: () => void;
  onSave: (form: FormState) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [form, setForm] = useState<FormState>(() => fromAnnouncement(entry));
  const expired = isExpired(entry.expiresAt);
  const live = entry.enabled && !expired;
  return (
    <li className="rounded-lg border border-[rgb(var(--muted)/0.4)] p-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{entry.title || <em>(untitled)</em>}</span>
            {live ? (
              <span className="inline-flex items-center rounded-full border border-[rgb(var(--accent)/0.45)] bg-[rgb(var(--accent)/0.12)] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-[rgb(var(--text))]">
                Live
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-[rgb(var(--muted)/0.5)] px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] soft-text">
                Ended
              </span>
            )}
          </span>
          <span className="mt-1 block text-[11px] soft-text">
            {formatDate(entry.publishedAt)} · id {entry.id}
          </span>
        </span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 soft-text" />
        ) : (
          <ChevronDown className="h-4 w-4 soft-text" />
        )}
      </button>

      {expanded ? (
        <div className="mt-3 space-y-3">
          <FormBody form={form} setForm={setForm} />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={onDelete}
              disabled={busy}
            >
              <Trash2 className="mr-1 h-4 w-4" /> Delete
            </Button>
            <Button onClick={() => onSave(form)} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
