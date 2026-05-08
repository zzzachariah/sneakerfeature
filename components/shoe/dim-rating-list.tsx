"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { StarRating } from "@/components/shoe/star-rating";
import { DIM_KEYS, DIM_LABELS, type DimKey } from "@/lib/star-rating";

type Size = "sm" | "md";

const TEXT_BY_SIZE: Record<Size, string> = {
  sm: "text-[0.7rem]",
  md: "text-[0.78rem]"
};

export function DimRatingList({
  stars,
  size = "sm"
}: {
  stars: Partial<Record<DimKey, number>> | null | undefined;
  size?: Size;
}) {
  const { translate } = useLocale();
  if (!stars) return null;

  return (
    <ul className="grid w-full gap-1.5">
      {DIM_KEYS.map((k) => {
        const value = stars[k];
        return (
          <li key={k} className="flex items-center justify-between gap-3">
            <span className={`uppercase tracking-[0.12em] soft-text ${TEXT_BY_SIZE[size]}`}>
              {translate(DIM_LABELS[k])}
            </span>
            {typeof value === "number" ? (
              <StarRating value={value} size={size} showNumber />
            ) : (
              <span className={`soft-text ${TEXT_BY_SIZE[size]}`}>—</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
