"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquareText, ThumbsDown, ThumbsUp, Trash2, LogIn, MoreHorizontal, Flag, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { TurnstileWidget } from "@/components/ui/turnstile";
import { DimRatingForm } from "@/components/detail/dim-rating-form";
import { Reveal } from "@/components/motion/reveal";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import type { DimKey } from "@/lib/star-rating";

type CommentItem = {
  id: string;
  userId: string;
  username: string;
  content: string;
  createdAt: string;
  likes: number;
  dislikes: number;
  myVote: "like" | "dislike" | null;
};

type CommentSectionProps = {
  shoeId: string;
  specStars?: number | null;
  initialMyDimRatings?: Partial<Record<DimKey, number>> | null;
  isLoggedIn?: boolean;
};

export function CommentSection({
  shoeId,
  specStars,
  initialMyDimRatings = null,
  isLoggedIn
}: CommentSectionProps) {
  const { translate } = useLocale();
  const [content, setContent] = useState("");
  const [token, setToken] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [reportOpenId, setReportOpenId] = useState<string | null>(null);

  const focusReady = typeof specStars === "number";
  const ratingLoggedIn = isLoggedIn ?? Boolean(userId);

  const canSubmit = useMemo(() => content.trim().length >= 3 && Boolean(userId), [content, userId]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/comments?shoeId=${encodeURIComponent(shoeId)}`, { cache: "no-store" });
      const data = await res.json();
      setComments(data.comments ?? []);
    } catch {
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [shoeId]);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;

    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
  }, []);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  async function submitComment() {
    if (!canSubmit) return;

    setPosting(true);
    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoeId, content, turnstileToken: token })
    });

    const data = await response.json();
    setIsError(!data.ok);
    setMessage(data.message ?? translate(data.ok ? "Comment posted" : "Failed"));

    if (data.ok) {
      setContent("");
      setToken("");
      await loadComments();
    }
    setPosting(false);
  }

  async function submitVote(commentId: string, voteType: "like" | "dislike") {
    const response = await fetch("/api/comments/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId, voteType })
    });

    const data = await response.json();
    setIsError(!data.ok);
    setMessage(data.message ?? translate(data.ok ? "Vote updated" : "Vote failed"));
    if (data.ok) await loadComments();
  }

  async function deleteComment(commentId: string) {
    const response = await fetch("/api/comments", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId })
    });

    const data = await response.json();
    setIsError(!data.ok);
    setMessage(data.message ?? translate(data.ok ? "Comment deleted" : "Delete failed"));
    if (data.ok) await loadComments();
  }

  async function reportComment(commentId: string, reason: "spam" | "harassment" | "inappropriate" | "other") {
    setMenuOpenId(null);
    setReportOpenId(null);
    const response = await fetch("/api/comments/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commentId, reason })
    });
    const data = await response.json();
    setIsError(!data.ok);
    setMessage(data.message ?? translate(data.ok ? "Report submitted" : "Failed"));
  }

  async function blockUser(targetUserId: string) {
    setMenuOpenId(null);
    const response = await fetch("/api/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetUserId, action: "block" })
    });
    const data = await response.json();
    setIsError(!data.ok);
    setMessage(data.message ?? translate(data.ok ? "User blocked" : "Failed"));
    if (data.ok) await loadComments();
  }

  return (
    <section className="space-y-4">
    {focusReady ? (
      <DimRatingForm
        shoeId={shoeId}
        initialMyRatings={initialMyDimRatings}
        isLoggedIn={ratingLoggedIn}
      />
    ) : null}
    <div className="grid gap-4 md:grid-cols-[0.9fr_1.1fr]">
      <aside className="surface-card premium-border rounded-3xl p-5 md:p-6">
        <div className="flex items-center gap-2">
          <MessageSquareText className="h-4 w-4 text-[rgb(var(--accent))]" />
          <h3 className="text-lg font-medium">{translate("Write a comment")}</h3>
        </div>
        <p className="mt-2 text-sm soft-text">{translate("Join the discussion with traction notes, fit tips, and durability observations.")}</p>

        {!userId && (
          <div className="mt-4 rounded-2xl border border-[rgb(var(--muted)/0.65)] bg-[rgb(var(--bg-elev)/0.45)] p-4">
            <p className="text-sm soft-text">{translate("You need to be logged in to post a comment.")}</p>
            <Link href="/login" className="mt-3 inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 py-1.5 text-sm transition hover:border-[rgb(var(--ring)/0.45)]">
              <LogIn className="h-4 w-4" /> {translate("Log in")}
            </Link>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <textarea
            className="min-h-40 w-full rounded-2xl border border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.75)] p-3 text-sm text-[rgb(var(--text))] outline-none transition placeholder:text-[rgb(var(--subtext))] hover:border-[rgb(var(--ring)/0.4)] focus:border-[rgb(var(--ring)/0.9)] focus:ring-4 focus:ring-[rgb(var(--ring)/0.2)]"
            placeholder={userId ? translate("Write your performance feedback...") : translate("Log in to start writing...")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!userId}
          />
          {userId && <TurnstileWidget onToken={setToken} />}
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submitComment} disabled={!canSubmit || posting}>{posting ? translate("Posting...") : translate("Post comment")}</Button>
            <p className="text-xs soft-text">{translate("Keep it constructive and specific to on-court experience.")}</p>
          </div>
          {message && <FeedbackMessage message={message} isError={isError} />}
          <p className="text-[11px] leading-5 soft-text">
            {translate("By posting, you agree to our")}{" "}
            <Link href="/terms" className="underline transition hover:text-[rgb(var(--accent))]">
              {translate("Terms")}
            </Link>
            {translate(". There is zero tolerance for objectionable content or abusive users; reported content is reviewed within 24 hours.")}
          </p>
        </div>
      </aside>

      <aside className="surface-card premium-border rounded-3xl p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-medium">{translate("View discussion")}</h3>
          <p className="text-xs soft-text">{comments.length} {translate(comments.length === 1 ? "comment" : "comments")}</p>
        </div>

        <div className="mt-4 space-y-3 md:max-h-[560px] md:overflow-auto md:pr-1">
          {loading && (
            <>
              <div className="skeleton h-24 rounded-2xl" />
              <div className="skeleton h-24 rounded-2xl" />
              <div className="skeleton h-24 rounded-2xl" />
            </>
          )}
          {!loading && comments.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[rgb(var(--muted)/0.7)] bg-[rgb(var(--bg-elev)/0.35)] p-5 text-center">
              <p className="text-sm font-medium">{translate("No discussion yet")}</p>
              <p className="mt-1 text-xs soft-text">{translate("Be the first to share how this shoe performs on court.")}</p>
            </div>
          )}

          {comments.map((comment, i) => {
            const isOwn = userId === comment.userId;
            return (
              <Reveal as="article" key={comment.id} index={Math.min(i, 8)} className="interactive-soft rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{comment.username}</p>
                    <p className="text-xs soft-text">{new Date(comment.createdAt).toLocaleString()}</p>
                  </div>
                  {isOwn ? (
                    <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-2 py-1 text-xs soft-text transition hover:border-red-300" onClick={() => deleteComment(comment.id)} aria-label={translate("Delete my comment")}>
                      <Trash2 className="h-3.5 w-3.5" /> {translate("Delete")}
                    </button>
                  ) : userId ? (
                    <div className="relative">
                      <button
                        type="button"
                        className="inline-flex items-center rounded-lg border border-[rgb(var(--muted)/0.5)] p-1.5 text-xs soft-text transition hover:border-[rgb(var(--ring)/0.45)]"
                        onClick={() => {
                          setMenuOpenId(menuOpenId === comment.id ? null : comment.id);
                          setReportOpenId(null);
                        }}
                        aria-label={translate("More")}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                      {menuOpenId === comment.id && (
                        <div className="absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-xl border border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev))] p-1 shadow-lg">
                          {reportOpenId === comment.id ? (
                            (["spam", "harassment", "inappropriate", "other"] as const).map((reason) => (
                              <button
                                key={reason}
                                type="button"
                                className="block w-full rounded-lg px-3 py-1.5 text-left text-xs capitalize transition hover:bg-[rgb(var(--muted)/0.3)]"
                                onClick={() => reportComment(comment.id, reason)}
                              >
                                {translate(reason)}
                              </button>
                            ))
                          ) : (
                            <>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs transition hover:bg-[rgb(var(--muted)/0.3)]"
                                onClick={() => setReportOpenId(comment.id)}
                              >
                                <Flag className="h-3.5 w-3.5" /> {translate("Report comment")}
                              </button>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-rose-400 transition hover:bg-rose-400/10"
                                onClick={() => blockUser(comment.userId)}
                              >
                                <Ban className="h-3.5 w-3.5" /> {translate("Block user")}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <p className="mt-2 text-sm leading-6">{comment.content}</p>

                <div className="mt-3 flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition active:scale-95 ${comment.myVote === "like" ? "border-emerald-400/80 bg-emerald-400/10 text-emerald-400" : "border-[rgb(var(--muted)/0.5)] soft-text hover:border-emerald-300/70"}`}
                    onClick={() => submitVote(comment.id, "like")}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> {comment.likes}
                  </button>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition active:scale-95 ${comment.myVote === "dislike" ? "border-rose-400/80 bg-rose-400/10 text-rose-400" : "border-[rgb(var(--muted)/0.5)] soft-text hover:border-rose-300/70"}`}
                    onClick={() => submitVote(comment.id, "dislike")}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" /> {comment.dislikes}
                  </button>
                </div>
              </Reveal>
            );
          })}
        </div>
      </aside>
    </div>
    </section>
  );
}
