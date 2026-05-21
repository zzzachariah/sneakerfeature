"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { ShoeImage } from "@/components/shoe/shoe-image";
import type { RecommendationItem } from "@/lib/ai/types";

type Props = {
  rec: RecommendationItem;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
};

export function RecommendationCard({ rec, selected, disabled, onToggle }: Props) {
  const { translate } = useLocale();
  const href = `/shoes/${rec.slug}` as Route;

  return (
    <div className="surface-card premium-border flex gap-3 rounded-2xl p-3">
      <Link href={href} className="shrink-0">
        <ShoeImage
          src={rec.image_url}
          alt={rec.shoe_name}
          fallbackLabel={translate("No image")}
          variant="suggestion"
          className="!mx-0"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link href={href} className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-[-0.01em]">{rec.shoe_name}</div>
            <div className="truncate text-[0.75rem] soft-text">{rec.brand}</div>
          </Link>
          <label
            className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md bg-[rgb(var(--text)/0.05)] px-1.5 py-1"
            title={translate("Add to compare")}
          >
            <input
              type="checkbox"
              checked={selected}
              disabled={disabled && !selected}
              onChange={onToggle}
              className="h-3.5 w-3.5 accent-[rgb(var(--text))] disabled:opacity-40"
              aria-label={translate("Add to compare")}
            />
          </label>
        </div>

        {rec.reason && <p className="mt-1.5 text-[0.82rem] leading-snug">{rec.reason}</p>}

        <div className="mt-2 flex items-center gap-3 text-[0.75rem]">
          <Link href={href} className="inline-flex items-center gap-0.5 font-medium text-[rgb(var(--text))] hover:underline">
            {translate("View details")}
            <ArrowRight className="h-3 w-3" />
          </Link>
          {rec.price != null && <span className="soft-text">¥{rec.price}</span>}
        </div>
      </div>
    </div>
  );
}
