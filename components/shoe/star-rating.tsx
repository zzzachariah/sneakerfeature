"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Star, X } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { clampUserStars, STAR_MAX } from "@/lib/star-rating";
import { starColor } from "@/lib/score-tone";

type Size = "sm" | "md" | "lg";

const SIZE_MAP: Record<Size, { star: string; gap: string; text: string }> = {
  sm: { star: "h-3.5 w-3.5", gap: "gap-0.5", text: "text-[0.7rem]" },
  md: { star: "h-4 w-4", gap: "gap-1", text: "text-[0.78rem]" },
  lg: { star: "h-6 w-6", gap: "gap-1.5", text: "text-sm" }
};

type StarRatingProps = {
  value: number;
  userRating?: number | null;
  interactive?: boolean;
  isLoggedIn?: boolean;
  loginHref?: string;
  onSubmit?: (rating: number) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  size?: Size;
  showNumber?: boolean;
  count?: number;
  busy?: boolean;
};

export function StarRating({
  value,
  userRating = null,
  interactive = false,
  isLoggedIn = true,
  loginHref = "/login",
  onSubmit,
  onClear,
  size = "md",
  showNumber = false,
  count,
  busy = false
}: StarRatingProps) {
  const router = useRouter();
  const { translate } = useLocale();
  const [hover, setHover] = useState<number | null>(null);
  const sizes = SIZE_MAP[size];

  const previewValue =
    interactive && hover !== null ? hover : userRating !== null ? userRating : value;
  const showCount = typeof count === "number" && count > 0;

  async function handleClick(starIndex: number, half: 0.5 | 1) {
    if (!interactive || busy) return;
    if (!isLoggedIn) {
      router.push(loginHref as Route);
      return;
    }
    await onSubmit?.(clampUserStars(starIndex + half));
  }

  return (
    <div className="inline-flex flex-wrap items-center gap-2">
      <div
        className={`relative inline-flex ${sizes.gap}`}
        onMouseLeave={() => setHover(null)}
        aria-label={`${previewValue.toFixed(1)} of ${STAR_MAX} stars`}
      >
        {[0, 1, 2, 3, 4].map((i) => {
          const pct = Math.max(0, Math.min(100, (previewValue - i) * 100));
          return (
            <span key={i} className={`relative inline-block ${sizes.star}`}>
              <Star
                className={`${sizes.star} text-[rgb(var(--muted)/0.7)]`}
                aria-hidden
              />
              <span
                className="star-fill pointer-events-none absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${pct}%` }}
              >
                <Star
                  className={`${sizes.star} fill-current text-amber-400`}
                  aria-hidden
                />
              </span>
            </span>
          );
        })}
        {interactive && (
          <div className="absolute inset-0 flex">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={`hit-${i}`} className="relative flex-1">
                <button
                  type="button"
                  className="absolute inset-y-0 left-0 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(i + 0.5)}
                  onClick={() => handleClick(i, 0.5)}
                  aria-label={translate("Rate") + ` ${i + 0.5}`}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 w-1/2 cursor-pointer"
                  onMouseEnter={() => setHover(i + 1)}
                  onClick={() => handleClick(i, 1)}
                  aria-label={translate("Rate") + ` ${i + 1}`}
                  disabled={busy}
                />
              </div>
            ))}
          </div>
        )}
      </div>
      {showNumber && (
        <span className={`num-display ${sizes.text}`}>
          <span className="font-medium" style={{ color: starColor(previewValue) }}>
            {previewValue.toFixed(1)}
          </span>
          {showCount ? <span className="soft-text">{` (${count})`}</span> : null}
        </span>
      )}
      {interactive && userRating !== null && onClear && (
        <button
          type="button"
          onClick={() => onClear()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--muted)/0.5)] px-2 py-1 text-xs soft-text transition hover:border-[rgb(var(--text)/0.4)] disabled:opacity-50"
          aria-label={translate("Clear my rating")}
        >
          <X className="h-3 w-3" />
          {translate("Clear my rating")}
        </button>
      )}
    </div>
  );
}
