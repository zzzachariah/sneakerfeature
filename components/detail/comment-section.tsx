"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageSquareText, ThumbsDown, ThumbsUp, Trash2, LogIn, MoreHorizontal, Flag, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { HumanCheck, type HumanCheckHandle } from "@/components/ui/human-check";
import { DimRatingForm } from "@/components/detail/dim-rating-form";
import { Reveal } from "@/components/motion/reveal";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import { nativeMenuAvailable, presentNativeMenu } from "@/components/native/native-menu";
import { haptics } from "@/lib/native/haptics";
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
  const humanCheckRef = useRef<HumanCheckHandle>(null);

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
      body: JSON.stringify({ shoeId, content, verificationToken: token })
    });

    const data = await response.json();
    setIsError(!data.ok);
    setMessage(data.message ?? translate(data.ok ? "Comment posted" : "Failed"));

    // The server consumed the single-use verification token (success or not),
    // so run a fresh challenge before the next post.
    humanCheckRef.current?.reset();
    if (data.ok) {
      setContent("");
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

  // Comment overflow menu. Inside the app, present a native (Liquid Glass) action
  // sheet — Report drills into a second sheet of reasons. On the web we fall back
  // to the inline dropdown toggled by menuOpenId/reportOpenId below.
  async function openCommentMenu(comment: { id: string; userId: string }) {
    if (!nativeMenuAvailable()) {
      setMenuOpenId(menuOpenId === comment.id ? null : comment.id);
      setReportOpenId(null);
      return;
    }
    haptics.selection();
    const choice = await presentNativeMenu(
      [
        { key: "report", label: translate("Report comment") },
        { key: "block", label: translate("Block user"), destructive: true }
      ],
      { title: translate("Comment") }
    );
    if (choice === "report") {
      const reasons = ["spam", "harassment", "inappropriate", "other"] as const;
      const reason = await presentNativeMenu(
        reasons.map((r) => ({ key: r, label: translate(r) })),
        { title: translate("Report comment") }
      );
      if (reason) await reportComment(comment.id, reason as (typeof reasons)[number]);
    } else if (choice === "block") {
      await blockUser(comment.userId);
    }
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
          <div className="glass glass-rim relative mt-4 rounded-2xl p-4">
            <p className="text-sm soft-text">{translate("You need to be logged in to post a comment.")}</p>
            <Link href="/login" className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 text-sm transition hover:border-[rgb(var(--text)/0.45)] md:min-h-[36px]">
              <LogIn className="h-4 w-4" /> {translate("Log in")}
            </Link>
          </div>
        )}

        <div className="mt-4 space-y-3">
          <Textarea
            className="min-h-40"
            placeholder={userId ? translate("Write your performance feedback...") : translate("Log in to start writing...")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            disabled={!userId}
          />
          {userId && <HumanCheck ref={humanCheckRef} action="comment" onToken={setToken} />}
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
          <p className="text-xs soft-text"><span className="num-display">{comments.length}</span> {translate(comments.length === 1 ? "comment" : "comments")}</p>
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
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[rgb(var(--muted)/0.7)] bg-[rgb(var(--bg-elev)/0.35)] p-6 text-center">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[rgb(var(--text)/0.06)] text-[rgb(var(--text)/0.7)]">
                <MessageSquareText className="h-5 w-5" aria-hidden />
              </span>
              <p className="text-sm font-medium">{translate("No discussion yet")}</p>
              <p className="text-xs soft-text">{translate("Be the first to share how this shoe performs on court.")}</p>
            </div>
          )}

          {comments.map((comment, i) => {
            const isOwn = userId === comment.userId;
            return (
              <Reveal as="article" key={comment.id} index={Math.min(i, 8)} className="interactive-soft rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{comment.username}</p>
                    <p className="num-display text-xs soft-text">{new Date(comment.createdAt).toLocaleString()}</p>
                  </div>
                  {isOwn ? (
                    <button type="button" className="inline-flex min-h-[44px] md:min-h-[36px] items-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-2 py-1 text-xs soft-text transition hover:border-red-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]" onClick={() => deleteComment(comment.id)} aria-label={translate("Delete my comment")}>
                      <Trash2 className="h-3.5 w-3.5" /> {translate("Delete")}
                    </button>
                  ) : userId ? (
                    <div className="relative">
                      <button
                        type="button"
                        className="inline-flex min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px] items-center justify-center rounded-lg border border-[rgb(var(--muted)/0.5)] p-1.5 text-xs soft-text transition hover:border-[rgb(var(--text)/0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)]"
                        onClick={() => openCommentMenu(comment)}
                        aria-label={translate("More")}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                      {menuOpenId === comment.id && (
                        <div className="nav-dropdown-panel absolute right-0 z-10 mt-1 w-44 overflow-hidden rounded-xl p-1">
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
                                className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-xs text-rose-500 transition hover:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-400/10"
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
                    className={`inline-flex min-h-[44px] md:min-h-[36px] items-center gap-1 rounded-md border px-2.5 py-1 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] ${comment.myVote === "like" ? "border-emerald-400/80 bg-emerald-400/10 text-emerald-600 dark:text-emerald-400" : "border-[rgb(var(--muted)/0.5)] soft-text hover:border-emerald-300/70"}`}
                    onClick={() => submitVote(comment.id, "like")}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> <span className="num-display">{comment.likes}</span>
                  </button>
                  <button
                    type="button"
                    className={`inline-flex min-h-[44px] md:min-h-[36px] items-center gap-1 rounded-md border px-2.5 py-1 transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] ${comment.myVote === "dislike" ? "border-rose-400/80 bg-rose-400/10 text-rose-500 dark:text-rose-400" : "border-[rgb(var(--muted)/0.5)] soft-text hover:border-rose-300/70"}`}
                    onClick={() => submitVote(comment.id, "dislike")}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" /> <span className="num-display">{comment.dislikes}</span>
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
