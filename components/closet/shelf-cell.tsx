"use client";

// One pair on the closet wall. The four premium variants each render a
// different PHYSICAL object (not a restyled card):
//   • Editorial — a wooden sample-rack bay: warm paper ground, a serif paper
//     label pinned under the shoe and a bronze spec plate; the wear meter is a
//     printed "mileage" rule. Retirement shows as a rotated ink stamp.
//   • Instrument — a floating glass pod: cyan rim light, scanline ground glow,
//     mono HUD readouts and an LED segment meter with a status lamp.
//   • Gallery — a museum pedestal: near-black plinth under a soft spotlight,
//     platinum hairline, an engraved plaque line and a dot-on-hairline meter.
//   • Arena — a locker stall: brushed metal, vent slits, a gold number plate
//     and a broadcast stat bar. Retirement-due flashes a gold RETIRE tag.
// The standard render keeps the site's plain card language, untouched.

import Link from "next/link";
import type { Route } from "next";
import { Ellipsis, Timer } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { ShoeImage } from "@/components/shoe/shoe-image";
import type { PremiumVariant } from "@/components/premium/variants";
import {
  costPerSession,
  shouldNudgeRetirement,
  wearRatio,
  wearStatus,
  WEAR_STATUS_LABEL,
  type ClosetItemRow
} from "@/lib/closet/wear";
import { WearMeter } from "@/components/closet/wear-meter";

export type ClosetShoe = {
  id: string;
  brand: string;
  shoe_name: string;
  slug?: string;
  image_url?: string | null;
};

export function ShelfCell({
  entry,
  index,
  variant,
  onLogWear,
  onEdit
}: {
  entry: { item: ClosetItemRow; shoe: ClosetShoe };
  index: number;
  variant: PremiumVariant;
  onLogWear: () => void;
  onEdit: () => void;
}) {
  const { translate } = useLocale();
  const { item, shoe } = entry;
  const ratio = wearRatio(Number(item.play_hours));
  const status = wearStatus(Number(item.play_hours));
  const nudge = shouldNudgeRetirement(item);
  const cps = costPerSession(item);

  const detailHref = shoe.slug ? (`/shoes/${shoe.slug}` as Route) : null;

  const img = (
    <ShoeImage
      src={shoe.image_url ?? undefined}
      alt={`${shoe.brand} ${shoe.shoe_name}`}
      fallbackLabel={shoe.shoe_name}
      variant="thumbnail"
      stage={variant === "standard"}
      className="pui-cell-img"
    />
  );

  const statLine = (
    <div className="pui-cell-stats">
      <span className="num-display">{Math.round(Number(item.play_hours) * 10) / 10}h</span>
      <span aria-hidden>·</span>
      <span>
        <span className="num-display">{item.sessions}</span> {translate("runs")}
      </span>
      {cps != null ? (
        <>
          <span aria-hidden>·</span>
          <span>
            ¥<span className="num-display">{cps >= 100 ? Math.round(cps) : cps.toFixed(1)}</span>/{translate("run")}
          </span>
        </>
      ) : null}
    </div>
  );

  const actions = (
    <div className="pui-cell-actions">
      {!item.retired ? (
        <button
          type="button"
          onClick={onLogWear}
          className="pui-cell-log tap-44"
          aria-label={`${translate("Log a run")} — ${shoe.shoe_name}`}
        >
          <Timer className="h-3.5 w-3.5" aria-hidden />
          <span>{translate("Log a run")}</span>
        </button>
      ) : (
        <span className="pui-cell-retired-note">{translate("Retired")}</span>
      )}
      <button
        type="button"
        onClick={onEdit}
        className="pui-cell-more tap-44"
        aria-label={`${translate("Manage")} — ${shoe.shoe_name}`}
      >
        <Ellipsis className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );

  const nameBlock = (
    <div className="pui-cell-id">
      <p className="pui-cell-brand">{shoe.brand}</p>
      {detailHref ? (
        <Link href={detailHref} className="pui-cell-name hover:underline underline-offset-2">
          {shoe.shoe_name}
        </Link>
      ) : (
        <p className="pui-cell-name">{shoe.shoe_name}</p>
      )}
      {item.size_label ? <span className="pui-cell-size">{item.size_label}</span> : null}
    </div>
  );

  return (
    <article
      className={`pui-cell pui-cell--${variant}${item.retired ? " is-retired" : ""}${nudge ? " is-due" : ""}`}
    >
      {/* Per-variant furniture (pure decoration, CSS-drawn). */}
      {variant === "instrument" && (
        <>
          <span className="pui-cell-lamp" data-status={status} aria-hidden />
          <span className="pui-cell-brackets" aria-hidden />
        </>
      )}
      {variant === "arena" && <span className="pui-cell-plate num-display" aria-hidden>{String(index + 1).padStart(2, "0")}</span>}
      {variant === "gallery" && <span className="pui-cell-no" aria-hidden>{`No. ${String(index + 1).padStart(2, "0")}`}</span>}

      <div className="pui-cell-stage">
        {img}
        {/* Retirement verdicts, per material: ink stamp / flash tag / captions */}
        {variant === "editorial" && (nudge || item.retired) ? (
          <span className={`pui-cell-stamp${item.retired ? " is-final" : ""}`}>
            {translate(item.retired ? "Retired" : "Time to retire")}
          </span>
        ) : null}
        {variant === "arena" && nudge ? (
          <span className="pui-cell-flash">{translate("Time to retire")}</span>
        ) : null}
      </div>

      <div className="pui-cell-body">
        {nameBlock}
        {statLine}
        <WearMeter variant={variant} ratio={ratio} status={status} label={translate(WEAR_STATUS_LABEL[status])} />
        {nudge && (variant === "standard" || variant === "instrument" || variant === "gallery") ? (
          <p className="pui-cell-nudge">{translate("Cushioning is likely cooked — consider retiring this pair.")}</p>
        ) : null}
        {actions}
      </div>
    </article>
  );
}
