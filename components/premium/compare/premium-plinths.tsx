"use client";

// The compared shoe, re-designed as a different card OBJECT per theme (matching
// the locked-in kits) — not the same plinth recolored:
//   • Editorial → COVER PLATE: a tall magazine cover, folio Nº, caption overlay.
//   • Instrument → DIAGNOSTIC: a status-label card (● ONLINE bar + mono readout).
//   • Gallery → PEDESTAL: huge image, maximum air, one whisper of a caption.
//   • Arena → TRADING CARD: gold frame, rank number, name banner.
// Uses ShoeImage on the shared neutral shoe-stage (never a skin colour behind the
// product). Standard users get ComparePlinths; this is premium-only.

import Link from "next/link";
import type { Route } from "next";
import { Plus, X } from "lucide-react";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Shoe } from "@/lib/types";
import type { PremiumVariant } from "@/components/premium/variants";

type Variant = Exclude<PremiumVariant, "standard">;

type Props = {
  variant: Variant;
  shoes: Shoe[];
  onRemove: (id: string) => void;
  onAdd: () => void;
  canAdd: boolean;
};

function colsClass(n: number): string {
  if (n <= 1) return "grid-cols-1 sm:grid-cols-2";
  if (n === 2) return "grid-cols-2";
  if (n === 3) return "grid-cols-2 md:grid-cols-3";
  if (n === 4) return "grid-cols-2 md:grid-cols-4";
  return "grid-cols-2 md:grid-cols-3 lg:grid-cols-5";
}

export function PremiumPlinths({ variant, shoes, onRemove, onAdd, canAdd }: Props) {
  const { translate } = useLocale();
  const showGhost = shoes.length < 5 && canAdd && shoes.length < 2;
  return (
    <div className={`pui-pl-grid grid items-stretch gap-x-4 gap-y-6 sm:gap-x-6 ${colsClass(shoes.length + (showGhost ? 1 : 0))}`}>
      {shoes.map((shoe, i) => (
        <Card key={shoe.id} variant={variant} shoe={shoe} index={i} onRemove={onRemove} translate={translate} />
      ))}
      {showGhost ? (
        <button type="button" onClick={onAdd} className="pui-pl-ghost">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-current opacity-70">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium">{translate("Add shoe")}</span>
        </button>
      ) : null}
    </div>
  );
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="pui-pl-remove">
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function Card({ variant, shoe, index, onRemove, translate }: { variant: Variant; shoe: Shoe; index: number; onRemove: (id: string) => void; translate: (s: string) => string }) {
  const href = `/shoes/${shoe.slug}` as Route;
  const no = String(index + 1).padStart(2, "0");
  const img = (widthPct: string) => (
    <ShoeImage src={shoe.image_url} alt={shoe.shoe_name} fallbackLabel={translate("No image")} variant="compare" className={`!max-w-none ${widthPct}`} />
  );
  const remove = <RemoveBtn onClick={() => onRemove(shoe.id)} label={translate("Remove shoe from compare")} />;

  if (variant === "editorial") {
    return (
      <div className="pui-cover group">
        {remove}
        <Link href={href} className="pui-cover-stage shoe-stage">
          <span className="pui-cover-folio">Nº {no}</span>
          {img("!w-[82%]")}
          <span className="pui-cover-cap">
            <span className="pui-cover-meta">{shoe.brand}{shoe.release_year ? ` · ${shoe.release_year}` : ""}</span>
            <span className="pui-cover-name">{shoe.shoe_name}</span>
          </span>
        </Link>
        <div className="pui-cover-foot">
          <StarRatingSlot value={shoe.finalStars ?? null} size="sm" showNumber count={shoe.userRatingCount ?? 0} />
        </div>
      </div>
    );
  }

  if (variant === "instrument") {
    return (
      <div className="pui-diagcard group">
        {remove}
        <div className="pui-diagcard-status">
          <span className="pui-diagcard-pip" aria-hidden />
          <span className="truncate">{translate("ONLINE")} · {shoe.shoe_name}</span>
        </div>
        <Link href={href} className="pui-diagcard-stage shoe-stage">{img("!w-[86%]")}</Link>
        <div className="pui-diagcard-foot">
          <span>ID-0{no}</span>
          <span className="pui-diagcard-score">{shoe.finalStars != null ? shoe.finalStars.toFixed(1) : "—"}★</span>
        </div>
      </div>
    );
  }

  if (variant === "gallery") {
    return (
      <div className="pui-pedcard group">
        {remove}
        <Link href={href} className="pui-pedcard-stage shoe-stage">{img("!w-[76%]")}</Link>
        <div className="pui-pedcard-cap">
          <span className="pui-pedcard-name">{shoe.shoe_name}</span>
          <span className="pui-pedcard-meta">{shoe.brand}{shoe.release_year ? ` · ${shoe.release_year}` : ""}</span>
        </div>
      </div>
    );
  }

  // arena — trading card
  return (
    <div className="pui-tcard group">
      {remove}
      <div className="pui-tcard-top">
        <span className="pui-tcard-no">{no}</span>
        <span className="pui-tcard-meta">{shoe.brand}{shoe.release_year ? ` · ${shoe.release_year}` : ""}</span>
      </div>
      <Link href={href} className="pui-tcard-stage shoe-stage">{img("!w-[84%]")}</Link>
      <div className="pui-tcard-name">{shoe.shoe_name}</div>
      <div className="pui-tcard-foot">
        <StarRatingSlot value={shoe.finalStars ?? null} size="sm" showNumber count={shoe.userRatingCount ?? 0} />
      </div>
    </div>
  );
}
