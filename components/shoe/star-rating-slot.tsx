"use client";

import Link from "next/link";
import { Sliders } from "lucide-react";
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
  const { translate } = useLocale();
  const { isLoggedIn, openModal } = useRatingFocus();

  if (typeof value === "number") {
    return (
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
    );
  }

  const className = `inline-flex items-center gap-1.5 rounded-md border border-dashed border-[rgb(var(--muted)/0.55)] px-2.5 py-1 ${PROMPT_TEXT_BY_SIZE[size]} soft-text transition hover:border-[rgb(var(--text)/0.4)] hover:text-[rgb(var(--text))]`;

  if (!isLoggedIn) {
    return (
      <Link href="/login" className={className} aria-label={translate("Sign in to pick playstyle")}>
        <Sliders className="h-3 w-3" />
        {translate("Sign in to pick playstyle")}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={openModal}
      className={className}
      aria-label={translate("Pick playstyle to see ratings")}
    >
      <Sliders className="h-3 w-3" />
      {translate("Pick playstyle to see ratings")}
    </button>
  );
}
