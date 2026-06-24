"use client";

import { useState } from "react";
import { Trash2, MessageSquareOff } from "lucide-react";
import { confirmDialog } from "@/components/native/native-menu";

export type CommentRow = {
  id: string;
  content: string;
  createdAt: string;
  author: string;
  shoeName: string;
};

export function CommentsClient({ initialRows }: { initialRows: CommentRow[] }) {
  const [rows, setRows] = useState<CommentRow[]>(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function remove(row: CommentRow) {
    const ok = await confirmDialog({
      message: `Delete this comment by @${row.author}? This can't be undone.`,
      okLabel: "Delete",
      destructive: true
    });
    if (!ok) return;
    setBusy(row.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId: row.id, action: "delete" })
      });
      const json = await res.json();
      if (json?.ok) {
        setRows((prev) => prev.filter((r) => r.id !== row.id));
        setMessage("Comment deleted.");
      } else {
        setMessage(json?.message ?? "Failed to delete.");
      }
    } catch {
      setMessage("Network error. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="surface-card premium-border flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
        <MessageSquareOff className="h-8 w-8 soft-text" />
        <p className="font-medium">No comments found</p>
        <p className="text-sm soft-text">Try a different search.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {message && <p className="text-sm text-[rgb(var(--accent))]">{message}</p>}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="surface-card premium-border rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs soft-text">
              <span className="font-medium text-[rgb(var(--text))]">@{row.author}</span>
              <span>·</span>
              <span>on {row.shoeName}</span>
              <span>·</span>
              <span>{new Date(row.createdAt).toLocaleString()}</span>
            </div>
            <blockquote className="mt-3 rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-3 text-sm leading-6">
              {row.content}
            </blockquote>
            <div className="mt-3">
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => remove(row)}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-rose-400/60 px-4 py-2 text-sm text-rose-400 transition hover:bg-rose-400/10 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
