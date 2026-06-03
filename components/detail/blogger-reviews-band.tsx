"use client";

import { useState } from "react";
import { Youtube, PlayCircle, ThumbsUp, ThumbsDown, ExternalLink, Sparkles } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { BloggerReview } from "@/lib/types";

type Platform = "youtube" | "bilibili";

// Featured "博主点评" band at the top of the comments slide. Content is stored in
// both Chinese and English, so we render the locale's copy directly — no runtime
// translation. A YouTube / Bilibili toggle (both always shown) switches between
// up to 3 cards per platform; the default tab follows the UI language (zh →
// Bilibili, en → YouTube, matching each platform's native content language).
// On mobile each platform's cards form a peeking swipe-carousel; md+ is a grid.
export function BloggerReviewsBand({ reviews }: { reviews: BloggerReview[] }) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  const [tab, setTab] = useState<Platform>(zh ? "bilibili" : "youtube");
  if (!reviews?.length) return null;

  const bili = reviews.filter((r) => r.platform === "bilibili");
  const yt = reviews.filter((r) => r.platform === "youtube");
  const active = tab === "youtube" ? yt : bili;
  const many = active.length > 1;
  const cardWidth = many ? "w-[82%]" : "w-full";

  const tabButton = (platform: Platform, count: number, label: string) => {
    const on = tab === platform;
    const Icon = platform === "youtube" ? Youtube : PlayCircle;
    return (
      <button
        type="button"
        onClick={() => setTab(platform)}
        aria-pressed={on}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition ${
          on
            ? "bg-[rgb(var(--accent)/0.15)] font-medium text-[rgb(var(--accent))]"
            : "soft-text hover:text-[rgb(var(--fg))]"
        }`}
      >
        <Icon className={`h-3.5 w-3.5 shrink-0 ${platform === "youtube" ? "text-rose-400" : "text-sky-400"}`} />
        {label}
        <span className="opacity-60">{count}</span>
      </button>
    );
  };

  return (
    <section className="surface-card premium-border rounded-3xl p-4 md:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0 text-[rgb(var(--accent))]" />
        <h3 className="text-base font-medium md:text-lg">{translate("Pro reviews")}</h3>
        <div className="ml-auto inline-flex rounded-xl border border-[rgb(var(--muted)/0.5)] p-0.5">
          {tabButton("bilibili", bili.length, zh ? "B站" : "Bilibili")}
          {tabButton("youtube", yt.length, "YouTube")}
        </div>
      </div>
      <p className="mt-1 text-xs leading-5 soft-text">
        {translate("Paraphrased highlights from sneaker reviewers — not verbatim quotes.")}
      </p>

      {active.length === 0 ? (
        <p className="mb-2 mt-6 text-center text-sm soft-text">
          {zh ? "该平台暂无点评" : "No reviews on this platform yet"}
        </p>
      ) : (
        <>
          <div className="chip-scroll -mx-1 mt-4 flex gap-3 overflow-x-auto px-1 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
            {active.map((review) => {
              const pros = (zh ? review.pros : review.pros_en ?? review.pros) ?? [];
              const cons = (zh ? review.cons : review.cons_en ?? review.cons) ?? [];
              const summary = (zh ? review.summary : review.summary_en ?? review.summary) ?? "";
              return (
                <article
                  key={review.id}
                  className={`interactive-soft flex ${cardWidth} shrink-0 snap-start flex-col rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] p-4 md:w-auto md:shrink`}
                >
                  <div className="flex items-center gap-2">
                    {review.platform === "youtube" ? (
                      <Youtube className="h-4 w-4 shrink-0 text-rose-400" />
                    ) : (
                      <PlayCircle className="h-4 w-4 shrink-0 text-sky-400" />
                    )}
                    <p
                      className="notranslate truncate text-sm font-medium"
                      title={review.blogger_name}
                      translate="no"
                    >
                      {review.blogger_name}
                    </p>
                  </div>

                  {summary ? <p className="mt-2 text-sm leading-6 soft-text">{summary}</p> : null}

                  <div className="mt-3 space-y-1.5">
                    {pros.map((p, i) => (
                      <p key={`p${i}`} className="flex items-start gap-1.5 text-xs leading-5">
                        <ThumbsUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        <span>{p}</span>
                      </p>
                    ))}
                    {cons.map((c, i) => (
                      <p key={`c${i}`} className="flex items-start gap-1.5 text-xs leading-5">
                        <ThumbsDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                        <span>{c}</span>
                      </p>
                    ))}
                  </div>

                  <div className="mt-auto pt-3">
                    <a
                      href={review.video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.5)] px-2.5 py-1.5 text-xs transition hover:border-[rgb(var(--ring)/0.45)] active:scale-[0.98]"
                    >
                      <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      {translate("Watch review")}
                      {review.source_label ? <span className="soft-text">· {review.source_label}</span> : null}
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
          {many ? (
            <p className="mt-2 text-center text-[0.7rem] soft-text md:hidden">
              {zh ? "← 左右滑动查看更多 →" : "← swipe for more →"}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
