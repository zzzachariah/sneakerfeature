"use client";

import { useCallback, useEffect, useState } from "react";
import { Youtube, PlayCircle, RefreshCw, Trash2, Save, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { confirmDialog } from "@/components/native/native-menu";

type AdminReview = {
  id: string;
  shoe_id: string;
  blogger_name: string;
  platform: "youtube" | "bilibili";
  video_url: string;
  pros: string[] | null;
  cons: string[] | null;
  summary: string | null;
  pros_en: string[] | null;
  cons_en: string[] | null;
  summary_en: string | null;
  status: "pending" | "ready" | "error";
  error_detail: string | null;
  is_published: boolean;
  source_label: string | null;
  transcript: string | null;
  created_at: string;
  updated_at: string;
  shoes: { shoe_name: string; brand: string | null; slug: string } | null;
};

type Draft = {
  blogger_name: string;
  video_url: string;
  source_label: string;
  summary: string;
  summary_en: string;
  pros0: string;
  pros1: string;
  cons0: string;
  cons1: string;
  pros_en0: string;
  pros_en1: string;
  cons_en0: string;
  cons_en1: string;
};

const STATUS_STYLES: Record<string, string> = {
  ready: "text-emerald-400",
  pending: "text-amber-400",
  error: "text-rose-400"
};

const inputCls =
  "mt-1 w-full rounded border border-[rgb(var(--muted)/0.5)] bg-transparent px-2 py-1.5 text-sm outline-none transition focus:border-[rgb(var(--text)/0.55)] focus:ring-2 focus:ring-[rgb(var(--text)/0.12)]";
const taCls = `${inputCls} min-h-16 leading-6`;

function toDraft(r: AdminReview): Draft {
  return {
    blogger_name: r.blogger_name ?? "",
    video_url: r.video_url ?? "",
    source_label: r.source_label ?? "",
    summary: r.summary ?? "",
    summary_en: r.summary_en ?? "",
    pros0: r.pros?.[0] ?? "",
    pros1: r.pros?.[1] ?? "",
    cons0: r.cons?.[0] ?? "",
    cons1: r.cons?.[1] ?? "",
    pros_en0: r.pros_en?.[0] ?? "",
    pros_en1: r.pros_en?.[1] ?? "",
    cons_en0: r.cons_en?.[0] ?? "",
    cons_en1: r.cons_en?.[1] ?? ""
  };
}

export function ShoeReviewsClient({ shoeId }: { shoeId: string }) {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/blogger-reviews?shoeId=${encodeURIComponent(shoeId)}`);
      const json = await res.json();
      if (json?.ok) {
        const rows = json.reviews as AdminReview[];
        setReviews(rows);
        setDrafts(Object.fromEntries(rows.map((r) => [r.id, toDraft(r)])));
      } else {
        setMessage(json?.message ?? "Failed to load.");
      }
    } finally {
      setLoading(false);
    }
  }, [shoeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (id: string, key: keyof Draft, value: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  const save = useCallback(
    async (id: string) => {
      const d = drafts[id];
      if (!d) return;
      setBusyId(id);
      setMessage(null);
      try {
        const res = await fetch(`/api/admin/blogger-reviews/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            blogger_name: d.blogger_name.trim(),
            video_url: d.video_url.trim(),
            source_label: d.source_label.trim() || null,
            summary: d.summary.trim() || null,
            summary_en: d.summary_en.trim() || null,
            pros: [d.pros0, d.pros1],
            cons: [d.cons0, d.cons1],
            pros_en: [d.pros_en0, d.pros_en1],
            cons_en: [d.cons_en0, d.cons_en1]
          })
        });
        const json = await res.json();
        setMessage(json?.message ?? (json?.ok ? "Saved." : "Failed."));
        if (json?.ok) await load();
      } finally {
        setBusyId(null);
      }
    },
    [drafts, load]
  );

  const action = useCallback(
    async (id: string, act: "publish" | "unpublish" | "resummarize") => {
      setBusyId(id);
      setMessage(null);
      try {
        const res = await fetch(`/api/admin/blogger-reviews/${id}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: act })
        });
        const json = await res.json();
        setMessage(json?.message ?? (json?.ok ? "Done." : "Failed."));
        if (json?.ok) await load();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  const remove = useCallback(
    async (id: string) => {
      if (!(await confirmDialog({ message: "Delete this blogger review? This cannot be undone.", okLabel: "Delete", destructive: true }))) return;
      setBusyId(id);
      setMessage(null);
      try {
        const res = await fetch(`/api/admin/blogger-reviews/${id}`, { method: "DELETE" });
        const json = await res.json();
        setMessage(json?.message ?? (json?.ok ? "Deleted." : "Failed."));
        if (json?.ok) await load();
      } finally {
        setBusyId(null);
      }
    },
    [load]
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-2 p-4">
        <p className="text-sm soft-text">
          {reviews.length} review(s) for this shoe. Content is stored in Chinese + English; the public band shows ready +
          published only.
        </p>
        <button
          onClick={() => load()}
          className="ml-auto rounded-full border border-[rgb(var(--muted)/0.5)] px-3 py-1 text-xs hover:bg-[rgb(var(--muted)/0.25)]"
        >
          Refresh
        </button>
        {message && <p className="w-full text-sm">{message}</p>}
      </Card>

      {loading ? (
        <p className="text-sm soft-text">Loading…</p>
      ) : reviews.length === 0 ? (
        <Card className="p-6 text-center text-sm soft-text">
          No blogger reviews for this shoe yet. Run the local ingest + summarize scripts to populate.
        </Card>
      ) : (
        reviews.map((r) => {
          const d = drafts[r.id];
          if (!d) return null;
          const busy = busyId === r.id;
          return (
            <Card key={r.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                {r.platform === "youtube" ? (
                  <Youtube className="h-4 w-4 text-rose-400" />
                ) : (
                  <PlayCircle className="h-4 w-4 text-sky-400" />
                )}
                <span className="font-medium">{r.blogger_name || "Untitled review"}</span>
                <span className={`text-xs ${STATUS_STYLES[r.status] ?? ""}`}>● {r.status}</span>
                <span className="text-xs soft-text">{r.is_published ? "published" : "hidden"}</span>
                {!r.transcript && <span className="text-xs text-amber-400">no transcript</span>}
                <a href={r.video_url} target="_blank" rel="noreferrer" className="ml-auto text-xs underline soft-text">
                  open video
                </a>
              </div>

              {r.error_detail && <p className="text-xs text-rose-400">error: {r.error_detail}</p>}

              <div className="grid gap-2 md:grid-cols-3">
                <label className="text-xs soft-text">
                  Blogger
                  <input className={inputCls} value={d.blogger_name} onChange={(e) => setField(r.id, "blogger_name", e.target.value)} />
                </label>
                <label className="text-xs soft-text">
                  Source label
                  <input className={inputCls} value={d.source_label} onChange={(e) => setField(r.id, "source_label", e.target.value)} />
                </label>
                <label className="text-xs soft-text">
                  Video URL
                  <input className={inputCls} value={d.video_url} onChange={(e) => setField(r.id, "video_url", e.target.value)} />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-[rgb(var(--muted)/0.35)] p-3">
                  <p className="text-xs font-semibold">中文（界面为中文时显示）</p>
                  <textarea className={taCls} placeholder="一句话总评" value={d.summary} onChange={(e) => setField(r.id, "summary", e.target.value)} />
                  <input className={inputCls} placeholder="优点 1" value={d.pros0} onChange={(e) => setField(r.id, "pros0", e.target.value)} />
                  <input className={inputCls} placeholder="优点 2" value={d.pros1} onChange={(e) => setField(r.id, "pros1", e.target.value)} />
                  <input className={inputCls} placeholder="缺点 1" value={d.cons0} onChange={(e) => setField(r.id, "cons0", e.target.value)} />
                  <input className={inputCls} placeholder="缺点 2" value={d.cons1} onChange={(e) => setField(r.id, "cons1", e.target.value)} />
                </div>
                <div className="space-y-2 rounded-lg border border-[rgb(var(--muted)/0.35)] p-3">
                  <p className="text-xs font-semibold">English (shown on the English UI)</p>
                  <textarea className={taCls} placeholder="one-line verdict" value={d.summary_en} onChange={(e) => setField(r.id, "summary_en", e.target.value)} />
                  <input className={inputCls} placeholder="pro 1" value={d.pros_en0} onChange={(e) => setField(r.id, "pros_en0", e.target.value)} />
                  <input className={inputCls} placeholder="pro 2" value={d.pros_en1} onChange={(e) => setField(r.id, "pros_en1", e.target.value)} />
                  <input className={inputCls} placeholder="con 1" value={d.cons_en0} onChange={(e) => setField(r.id, "cons_en0", e.target.value)} />
                  <input className={inputCls} placeholder="con 2" value={d.cons_en1} onChange={(e) => setField(r.id, "cons_en1", e.target.value)} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => save(r.id)} disabled={busy}>
                  <Save className="mr-1 h-4 w-4" />
                  Save
                </Button>
                <Button variant="secondary" onClick={() => action(r.id, "resummarize")} disabled={busy || !r.transcript}>
                  <RefreshCw className="mr-1 h-4 w-4" />
                  Re-summarize
                </Button>
                {r.is_published ? (
                  <Button variant="secondary" onClick={() => action(r.id, "unpublish")} disabled={busy}>
                    <EyeOff className="mr-1 h-4 w-4" />
                    Unpublish
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => action(r.id, "publish")} disabled={busy}>
                    <Eye className="mr-1 h-4 w-4" />
                    Publish
                  </Button>
                )}
                <button
                  onClick={() => remove(r.id)}
                  disabled={busy}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-2.5 py-1.5 text-xs text-rose-400 transition hover:border-rose-300/70 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
