"use client";

import { Youtube, PlayCircle, ThumbsUp, ThumbsDown, ExternalLink, Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { BloggerReview } from "@/lib/types";

// Featured "博主点评" band at the top of the comments slide. Content is stored in
// both Chinese and English, so we render the locale's copy directly — no runtime
// translation. Blogger names render as-is; only the chrome labels go through
// translate().
export function BloggerReviewsBand({ reviews }: { reviews: BloggerReview[] }) {
  const { translate, locale } = useLocale();
  if (!reviews?.length) return null;

  const zh = locale === "zh";

  return (
    <section className="surface-card premium-border rounded-3xl p-5 md:p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-[rgb(var(--accent))]" />
        <h3 className="text-lg font-medium">{translate("Pro reviews")}</h3>
      </div>
      <p className="mt-1 text-xs soft-text">
        {translate("Paraphrased highlights from sneaker reviewers — not verbatim quotes.")}
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {reviews.map((review) => {
          const pros = (zh ? review.pros : review.pros_en ?? review.pros) ?? [];
          const cons = (zh ? review.cons : review.cons_en ?? review.cons) ?? [];
          const summary = (zh ? review.summary : review.summary_en ?? review.summary) ?? "";
          return (
            <article
              key={review.id}
              className="interactive-soft rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-4"
            >
              <div className="flex items-center gap-2">
                {review.platform === "youtube" ? (
                  <Youtube className="h-4 w-4 shrink-0 text-rose-400" />
                ) : (
                  <PlayCircle className="h-4 w-4 shrink-0 text-sky-400" />
                )}
                <p className="truncate text-sm font-medium" title={review.blogger_name}>
                  {review.blogger_name}
                </p>
              </div>

              {summary ? <p className="mt-2 text-sm leading-6 soft-text">{summary}</p> : null}

              <div className="mt-3 space-y-1.5">
                {pros.map((p, i) => (
                  <p key={`p${i}`} className="flex items-start gap-1.5 text-xs">
                    <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    <span>{p}</span>
                  </p>
                ))}
                {cons.map((c, i) => (
                  <p key={`c${i}`} className="flex items-start gap-1.5 text-xs">
                    <ThumbsDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                    <span>{c}</span>
                  </p>
                ))}
              </div>

              <a
                href={review.video_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-2.5 py-1.5 text-xs transition hover:border-[rgb(var(--ring)/0.45)]"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {translate("Watch review")}
                {review.source_label ? <span className="soft-text">· {review.source_label}</span> : null}
              </a>
            </article>
          );
        })}
      </div>
    </section>
  );
}
