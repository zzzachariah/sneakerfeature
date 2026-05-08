"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquareText, ThumbsDown, ThumbsUp, Trash2, LogIn, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { TurnstileWidget } from "@/components/ui/turnstile";
import { StarRating } from "@/components/shoe/star-rating";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import { computeFinalStars } from "@/lib/star-rating";

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
  specStars?: number;
  initialMyRating?: number | null;
  initialAvg?: number | null;
  initialCount?: number;
  isLoggedIn?: boolean;
};

export function CommentSection({
  shoeId,
  specStars,
  initialMyRating = null,
  initialAvg = null,
  initialCount = 0,
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
  const [myRating, setMyRating] = useState<number | null>(initialMyRating);
  const [aggSum, setAggSum] = useState<number>((initialAvg ?? 0) * (initialCount ?? 0));
  const [aggCount, setAggCount] = useState<number>(initialCount ?? 0);
  const [ratingBusy, setRatingBusy] = useState(false);
  const [ratingMessage, setRatingMessage] = useState("");
  const [ratingIsError, setRatingIsError] = useState(false);

  const aggAvg = aggCount > 0 ? aggSum / aggCount : null;
  const ratingFinal = computeFinalStars(specStars ?? 0, aggAvg, aggCount);
  const ratingLoggedIn = isLoggedIn ?? Boolean(userId);

  const canSubmit = useMemo(() => content.trim().length >= 3 && Boolean(userId), [content, userId]);

  const loadComments = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/comments?shoeId=${encodeURIComponent(shoeId)}`, { cache: "no-store" });
    const data = await res.json();
    setComments(data.comments ?? []);
    setLoading(false);
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

  async function submitRating(next: number) {
    setRatingBusy(true);
    setRatingMessage("");
    const response = await fetch("/api/ratings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoeId, rating: next })
    });
    const data = await response.json();
    if (data.ok) {
      const prev = myRating;
      setAggSum((prevSum) => prevSum - (prev ?? 0) + next);
      if (prev === null) setAggCount((c) => c + 1);
      setMyRating(next);
      setRatingIsError(false);
      setRatingMessage(translate(prev === null ? "Rating saved." : "Rating updated."));
    } else {
      setRatingIsError(true);
      setRatingMessage(data.message ?? translate("Vote failed"));
    }
    setRatingBusy(false);
  }

  async function clearRating() {
    if (myRating === null) return;
    setRatingBusy(true);
    setRatingMessage("");
    const response = await fetch("/api/ratings", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoeId })
    });
    const data = await response.json();
    if (data.ok) {
      const prev = myRating;
      setAggSum((prevSum) => prevSum - (prev ?? 0));
      setAggCount((c) => Math.max(0, c - 1));
      setMyRating(null);
      setRatingIsError(false);
      setRatingMessage(translate("Rating cleared."));
    } else {
      setRatingIsError(true);
      setRatingMessage(data.message ?? translate("Vote failed"));
    }
    setRatingBusy(false);
  }

  return (
    <section className="space-y-4">
    <div className="surface-card premium-border rounded-3xl p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-400" />
        <h3 className="text-lg font-medium">{translate("Your rating")}</h3>
      </div>
      <p className="mt-1 text-xs soft-text">{translate("Min 0.5, max 5.0, in 0.5 steps.")}</p>
      <div className="mt-3">
        <StarRating
          value={ratingFinal}
          userRating={myRating}
          interactive
          isLoggedIn={ratingLoggedIn}
          onSubmit={submitRating}
          onClear={clearRating}
          size="lg"
          showNumber
          count={aggCount}
          busy={ratingBusy}
        />
      </div>
      {!ratingLoggedIn && (
        <p className="mt-2 text-xs soft-text">{translate("Sign in to rate")}</p>
      )}
      {ratingMessage && (
        <div className="mt-2">
          <FeedbackMessage message={ratingMessage} isError={ratingIsError} />
        </div>
      )}
    </div>
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

          {comments.map((comment) => {
            const isOwn = userId === comment.userId;
            return (
              <article key={comment.id} className="interactive-soft rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium">{comment.username}</p>
                    <p className="text-xs soft-text">{new Date(comment.createdAt).toLocaleString()}</p>
                  </div>
                  {isOwn && (
                    <button type="button" className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-2 py-1 text-xs soft-text transition hover:border-red-300" onClick={() => deleteComment(comment.id)} aria-label={translate("Delete my comment")}>
                      <Trash2 className="h-3.5 w-3.5" /> {translate("Delete")}
                    </button>
                  )}
                </div>

                <p className="mt-2 text-sm leading-6">{comment.content}</p>

                <div className="mt-3 flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition ${comment.myVote === "like" ? "border-emerald-400/80 bg-emerald-400/10 text-emerald-400" : "border-[rgb(var(--muted)/0.5)] soft-text hover:border-emerald-300/70"}`}
                    onClick={() => submitVote(comment.id, "like")}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" /> {comment.likes}
                  </button>
                  <button
                    type="button"
                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 transition ${comment.myVote === "dislike" ? "border-rose-400/80 bg-rose-400/10 text-rose-400" : "border-[rgb(var(--muted)/0.5)] soft-text hover:border-rose-300/70"}`}
                    onClick={() => submitVote(comment.id, "dislike")}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" /> {comment.dislikes}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </aside>
    </div>
    </section>
  );
}
