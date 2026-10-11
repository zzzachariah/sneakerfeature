"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { useRatingFocus } from "@/components/preferences/rating-focus-provider";
import { StarRating } from "@/components/shoe/star-rating";

type Size = "sm" | "md" | "lg";

type StarRatingSlotProps = {
  value: number | null | undefined;
  userRating?: number | null;
  count?: number;
  size?: Size;
  showNumber?: boolean;
  interactive?: boolean;
  onSubmit?: (rating: number) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
  busy?: boolean;
};

const PROMPT_TEXT_BY_SIZE: Record<Size, string> = {
  sm: "text-[0.7rem]",
  md: "text-[0.78rem]",
  lg: "text-sm"
};

export function StarRatingSlot({
  value,
  userRating = null,
  count,
  size = "md",
  showNumber = false,
  interactive = false,
  onSubmit,
  onClear,
  busy = false
}: StarRatingSlotProps) {
  const { locale } = useLocale();
  const { isLoggedIn } = useRatingFocus();

  if (typeof value === "number" && Number.isFinite(value)) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2" title={locale === "zh" ? "星级是鞋库内的相对资料评分，并非用户打分的平均值；评价越少，结论越不确定。" : "Stars are relative catalog estimates, not a mean user rating. Fewer reviews mean less certainty."}>
      <StarRating
        value={value}
        userRating={userRating}
        interactive={interactive}
        isLoggedIn={isLoggedIn}
        onSubmit={onSubmit}
        onClear={onClear}
        size={size}
        showNumber={showNumber}
        count={count}
        busy={busy}
      />
      {!interactive && <span className="text-[0.65rem] soft-text">{(count ?? 0) === 0 ? (locale === "zh" ? "资料估算" : "Spec estimate") : (count ?? 0) < 5 ? (locale === "zh" ? "评价样本少" : "Few reviews") : (locale === "zh" ? "综合评分" : "Combined rating")}</span>}
      </span>
    );
  }

  return <span className={`inline-flex items-center rounded-md border border-dashed border-[rgb(var(--muted)/0.55)] px-2.5 py-1 ${PROMPT_TEXT_BY_SIZE[size]} soft-text`}>
    {locale === "zh" ? "评分资料不足" : "Not enough rating data"}
  </span>;
}
