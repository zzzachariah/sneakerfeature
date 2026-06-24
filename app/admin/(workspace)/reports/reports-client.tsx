"use client";

import { useState } from "react";
import { Flag, Trash2, Check, ShieldCheck } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export type ReportRow = {
  id: string;
  reason: string;
  createdAt: string;
  commentId: string;
  commentContent: string;
  commentExists: boolean;
  authorUsername: string;
  reporterUsername: string;
};

export function ReportsClient({ initialReports }: { initialReports: ReportRow[] }) {
  const [reports, setReports] = useState<ReportRow[]>(initialReports);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function act(report: ReportRow, action: "delete_comment" | "dismiss") {
    setBusy(report.id);
    try {
      const res = await fetch("/api/admin/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id, commentId: report.commentId, action })
      });
      const data = await res.json();
      setMessage(data.message ?? "");
      if (data.ok) setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch {
      setMessage("Network error. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Reported comments"
        description="Reports are reviewed within 24 hours. Delete removes the comment for everyone; dismiss keeps it."
        icon={Flag}
        actions={
          <span className="rounded-full border border-[rgb(var(--muted)/0.5)] px-2.5 py-0.5 text-xs soft-text">
            {reports.length} open
          </span>
        }
      />

      {message && <p className="text-sm text-[rgb(var(--accent))]">{message}</p>}

      {reports.length === 0 ? (
        <div className="surface-card premium-border flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-emerald-400" />
          <p className="font-medium">No open reports</p>
          <p className="text-sm soft-text">The moderation queue is clear.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => (
            <li key={report.id} className="surface-card premium-border rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs soft-text">
                <span className="rounded-full bg-[rgb(var(--accent)/0.12)] px-2 py-0.5 font-medium capitalize text-[rgb(var(--accent))]">
                  {report.reason}
                </span>
                <span>by @{report.reporterUsername}</span>
                <span>·</span>
                <span>{new Date(report.createdAt).toLocaleString()}</span>
              </div>

              <blockquote className="mt-3 rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-3 text-sm leading-6 break-words">
                {report.commentExists ? report.commentContent : <em className="soft-text">(comment already deleted)</em>}
              </blockquote>
              <p className="mt-1 text-xs soft-text">author: @{report.authorUsername}</p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === report.id || !report.commentExists}
                  onClick={() => act(report, "delete_comment")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/60 px-3 py-1.5 text-sm text-rose-400 transition hover:bg-rose-400/10 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" /> Delete comment
                </button>
                <button
                  type="button"
                  disabled={busy === report.id}
                  onClick={() => act(report, "dismiss")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 py-1.5 text-sm transition hover:border-[rgb(var(--text)/0.45)] disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Dismiss
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
