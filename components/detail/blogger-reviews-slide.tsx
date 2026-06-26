"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Youtube,
  PlayCircle,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
  Sparkles
} from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { BloggerReview } from "@/lib/types";

type Platform = "youtube" | "bilibili";

// The dedicated 博主点评 slide body: two side-by-side galleries (Bilibili left,
// YouTube right) on desktop, a single gallery + centered platform pills on
// mobile. Each gallery shows one reviewer at a time; on mobile the user
// horizontally swipes the card to flip between reviewers (no side rails).
// Content is stored per-locale, so it renders the UI language's copy directly
// (blogger names are never translated).
type PlatformReviews = { platform: Platform; reviews: BloggerReview[] };

export function BloggerReviewsSlideBody({ reviews }: { reviews: BloggerReview[] }) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  const bili = reviews.filter((r) => r.platform === "bilibili");
  const yt = reviews.filter((r) => r.platform === "youtube");
  // Bilibili left, YouTube right — but only platforms that actually have reviews.
  const platforms: PlatformReviews[] = [
    { platform: "bilibili" as Platform, reviews: bili },
    { platform: "youtube" as Platform, reviews: yt }
  ].filter((p) => p.reviews.length > 0);

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-4 py-6 md:px-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 shrink-0 text-[rgb(var(--accent))]" />
        <h2 className="text-xl font-semibold tracking-[-0.02em] md:text-2xl">{translate("Pro reviews")}</h2>
      </div>
      <p className="mt-1 text-sm soft-text">
        {translate("Paraphrased highlights from sneaker reviewers — not verbatim quotes.")}
      </p>

      {platforms.length === 0 ? (
        <p className="mt-10 text-center text-base soft-text">
          {zh ? "暂无博主点评" : "No pro reviews yet"}
        </p>
      ) : (
        <>
          {/* Desktop: galleries side by side (only platforms with reviews). */}
          <div
            className={`mt-5 hidden gap-6 md:grid ${
              platforms.length === 1 ? "mx-auto w-full max-w-xl md:grid-cols-1" : "md:grid-cols-2"
            }`}
          >
            {platforms.map((p) => (
              <ReviewGallery key={p.platform} platform={p.platform} reviews={p.reviews} />
            ))}
          </div>

          {/* Mobile: platform-switch tabs + a single gallery. */}
          <div className="mt-5 md:hidden">
            <MobileGalleries platforms={platforms} />
          </div>
        </>
      )}
    </div>
  );
}

// Mobile layout: tabs to switch platform (only shown when both platforms have
// reviews), then a single gallery for the active platform. Default tab follows
// the UI language (zh → Bilibili, en → YouTube) when that platform is present.
function MobileGalleries({ platforms }: { platforms: PlatformReviews[] }) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const preferred: Platform = zh ? "bilibili" : "youtube";
  const initial = Math.max(
    0,
    platforms.findIndex((p) => p.platform === preferred)
  );
  const [tab, setTab] = useState(initial);
  const idx = Math.min(tab, platforms.length - 1);
  const active = platforms[idx];

  return (
    <>
      {platforms.length > 1 ? (
        <div className="mb-3 flex justify-center">
          <div className="inline-flex rounded-xl border border-[rgb(var(--muted)/0.5)] p-0.5 ios-glass-segmented">
          {platforms.map((p, i) => {
            const on = i === idx;
            const Icon = p.platform === "youtube" ? Youtube : PlayCircle;
            const label = p.platform === "youtube" ? "YouTube" : zh ? "B站" : "Bilibili";
            return (
              <button
                key={p.platform}
                type="button"
                onClick={() => setTab(i)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${
                  on ? "bg-[rgb(var(--accent)/0.15)] font-medium text-[rgb(var(--accent))]" : "soft-text"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${p.platform === "youtube" ? "text-rose-400" : "text-sky-400"}`} />
                {label}
                <span className="opacity-60">{p.reviews.length}</span>
              </button>
            );
          })}
          </div>
        </div>
      ) : null}
      <ReviewGallery key={active.platform} platform={active.platform} reviews={active.reviews} />
    </>
  );
}

function ReviewGallery({ platform, reviews }: { platform: Platform; reviews: BloggerReview[] }) {
  const { translate, locale } = useLocale();
  const zh = locale === "zh";
  const [index, setIndex] = useState(0);

  const len = reviews.length;
  const cur = len ? Math.min(index, len - 1) : 0;
  const Icon = platform === "youtube" ? Youtube : PlayCircle;
  const accent = platform === "youtube" ? "text-rose-400" : "text-sky-400";
  const label = platform === "youtube" ? "YouTube" : zh ? "B站" : "Bilibili";

  const go = (delta: number) => {
    if (len < 2) return;
    setIndex((p) => (p + delta + len) % len);
  };

  // Horizontal swipe to flip between reviewers on mobile (replaces the old
  // left/right chevron rails). Tracks the first finger only; ignores anything
  // that turns more vertical than horizontal so the page can still scroll.
  const touchRef = useRef<{ x: number; y: number; locked: "h" | "v" | null } | null>(null);
  const SWIPE_THRESHOLD = 48;
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) {
      touchRef.current = null;
      return;
    }
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, locked: null };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touchRef.current;
    if (!t || t.locked === "v") return;
    const dx = e.touches[0].clientX - t.x;
    const dy = e.touches[0].clientY - t.y;
    if (!t.locked && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      t.locked = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const t = touchRef.current;
    touchRef.current = null;
    if (!t || t.locked !== "h") return;
    const dx = e.changedTouches[0].clientX - t.x;
    if (dx <= -SWIPE_THRESHOLD) go(1);
    else if (dx >= SWIPE_THRESHOLD) go(-1);
  };

  if (!len) return null;

  return (
    <section className="flex flex-col">
      <div className="mb-2 flex items-center gap-2">
        <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs soft-text">
          {cur + 1} / {len}
        </span>
      </div>

      {/* All cards share ONE grid cell, so the stage is as tall as the TALLEST
          card and never jumps when switching. The active card fades + slides in;
          the others sit transparent, parked left/right. Swipe horizontally to
          switch reviewers (mobile); on desktop, use the dots below. */}
      <div
        className="relative grid flex-1 content-center min-h-[12rem] overflow-hidden rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.45)] touch-pan-y"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => { touchRef.current = null; }}
      >
        {reviews.map((r, idx) => {
          const active = idx === cur;
          const pros = (zh ? r.pros : r.pros_en ?? r.pros) ?? [];
          const cons = (zh ? r.cons : r.cons_en ?? r.cons) ?? [];
          const summary = (zh ? r.summary : r.summary_en ?? r.summary) ?? "";
          return (
            <motion.article
              key={r.id}
              className="col-start-1 row-start-1 w-full px-5 py-5 md:px-8 md:py-6"
              initial={false}
              animate={{ opacity: active ? 1 : 0, x: active ? 0 : idx < cur ? -32 : 32 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ zIndex: active ? 1 : 0, pointerEvents: active ? "auto" : "none" }}
              aria-hidden={!active}
            >
              <p
                className="notranslate truncate text-base font-semibold md:text-lg"
                title={r.blogger_name}
                translate="no"
              >
                {r.blogger_name}
              </p>
              {summary ? <p className="mt-2 text-sm leading-7 soft-text md:text-base">{summary}</p> : null}
              <div className="mt-3 space-y-2">
                {pros.map((p, k) => (
                  <p key={`p${k}`} className="flex items-start gap-2 text-sm md:text-base">
                    <ThumbsUp className="mt-1 h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{p}</span>
                  </p>
                ))}
                {cons.map((c, k) => (
                  <p key={`c${k}`} className="flex items-start gap-2 text-sm md:text-base">
                    <ThumbsDown className="mt-1 h-4 w-4 shrink-0 text-rose-400" />
                    <span>{c}</span>
                  </p>
                ))}
              </div>
              <div className="mt-4">
                <a
                  href={r.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-[rgb(var(--muted)/0.5)] px-3 text-sm transition hover:border-[rgb(var(--text)/0.45)] active:scale-[0.98] md:min-h-[36px]"
                >
                  <ExternalLink className="h-4 w-4 shrink-0" />
                  {translate("Watch review")}
                  {r.source_label ? <span className="soft-text">· {r.source_label}</span> : null}
                </a>
              </div>
            </motion.article>
          );
        })}

      </div>

      {len > 1 ? (
        <div className="mt-1 flex justify-center gap-1.5">
          {reviews.map((r, idx) => (
            <button
              key={r.id}
              type="button"
              aria-label={`${idx + 1}`}
              onClick={() => setIndex(idx)}
              className="flex h-11 w-6 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className="block h-1.5 rounded-full transition-all"
                style={{
                  width: idx === cur ? 18 : 6,
                  background: idx === cur ? "rgb(var(--text)/0.75)" : "rgb(var(--muted)/0.6)"
                }}
              />
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
