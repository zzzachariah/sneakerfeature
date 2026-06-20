"use client";

import { useState } from "react";
import Link from "next/link";
import { ImageIcon, Check, X, ShieldCheck, ArrowRight, ExternalLink } from "lucide-react";

export type CorrectionRow = {
  id: string;
  shoeId: string;
  shoeName: string;
  shoeSlug: string | null;
  submittedImageUrl: string;
  currentImageUrl: string | null;
  note: string;
  submitterUsername: string;
  createdAt: string;
};

export function ImageCorrectionsClient({ initialCorrections }: { initialCorrections: CorrectionRow[] }) {
  const [corrections, setCorrections] = useState<CorrectionRow[]>(initialCorrections);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function act(correction: CorrectionRow, action: "approve" | "reject") {
    setBusy(correction.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/image-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: correction.id, action })
      });
      const data = await res.json();
      setMessage(data.message ?? "");
      if (data.ok) setCorrections((prev) => prev.filter((c) => c.id !== correction.id));
    } catch {
      setMessage("Network error. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center gap-2">
        <ImageIcon className="h-5 w-5 text-[rgb(var(--accent))]" />
        <h1 className="text-xl font-semibold">Image corrections</h1>
        <span className="ml-auto rounded-full border border-[rgb(var(--muted)/0.5)] px-2.5 py-0.5 text-xs soft-text">
          {corrections.length} pending
        </span>
      </header>
      <p className="text-sm soft-text">
        Users upload a photo they believe better represents a shoe. Approving replaces the shoe&apos;s live image
        with the uploaded one; rejecting discards it.
      </p>

      {message && <p className="text-sm text-[rgb(var(--accent))]">{message}</p>}

      {corrections.length === 0 ? (
        <div className="surface-card premium-border flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <ShieldCheck className="h-8 w-8 text-emerald-400" />
          <p className="font-medium">No pending image corrections</p>
          <p className="text-sm soft-text">The review queue is clear.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {corrections.map((correction) => (
            <li key={correction.id} className="surface-card premium-border rounded-2xl p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs soft-text">
                <span className="rounded-full bg-[rgb(var(--accent)/0.12)] px-2 py-0.5 font-medium text-[rgb(var(--accent))]">
                  Image fix
                </span>
                <span>by @{correction.submitterUsername}</span>
                <span>·</span>
                <span>{new Date(correction.createdAt).toLocaleString()}</span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <p className="font-semibold">{correction.shoeName}</p>
                {correction.shoeSlug && (
                  <Link
                    href={`/shoes/${correction.shoeSlug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-[rgb(var(--accent))]"
                  >
                    View <ExternalLink className="h-3 w-3" />
                  </Link>
                )}
              </div>

              <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <figure className="flex flex-col items-center gap-1">
                  <div className="aspect-square w-full max-w-[10rem] overflow-hidden rounded-xl border border-[rgb(var(--muted)/0.45)] bg-white">
                    {correction.currentImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={correction.currentImageUrl} alt="Current" className="h-full w-full object-contain" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs soft-text">No current image</div>
                    )}
                  </div>
                  <figcaption className="text-[0.65rem] uppercase tracking-[0.12em] soft-text">Current</figcaption>
                </figure>

                <ArrowRight className="h-5 w-5 soft-text" />

                <figure className="flex flex-col items-center gap-1">
                  <div className="aspect-square w-full max-w-[10rem] overflow-hidden rounded-xl border border-emerald-400/50 bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={correction.submittedImageUrl} alt="Suggested" className="h-full w-full object-contain" />
                  </div>
                  <figcaption className="text-[0.65rem] uppercase tracking-[0.12em] text-emerald-400">Suggested</figcaption>
                </figure>
              </div>

              {correction.note && (
                <p className="mt-3 rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-3 text-sm leading-6">
                  {correction.note}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === correction.id}
                  onClick={() => act(correction, "approve")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/60 px-3 py-1.5 text-sm text-emerald-400 transition hover:bg-emerald-400/10 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Approve &amp; apply
                </button>
                <button
                  type="button"
                  disabled={busy === correction.id}
                  onClick={() => act(correction, "reject")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/60 px-3 py-1.5 text-sm text-rose-400 transition hover:bg-rose-400/10 disabled:opacity-50"
                >
                  <X className="h-4 w-4" /> Reject
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
