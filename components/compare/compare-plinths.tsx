"use client";

import { Plus, X } from "lucide-react";
import { motion } from "framer-motion";
import { Shoe } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { StarRatingSlot } from "@/components/shoe/star-rating-slot";
import { DimRatingList } from "@/components/shoe/dim-rating-list";
import { useLocale } from "@/components/i18n/locale-provider";
import { DynamicTranslatedText } from "@/components/i18n/dynamic-translated-text";

type Props = {
  shoes: Shoe[];
  onRemove: (id: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  showRatingDetail?: boolean;
};

function gridTemplate(count: number, hasAddGhost: boolean) {
  if (count === 1 && hasAddGhost) return "grid-cols-1 md:grid-cols-2";
  if (count === 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2 gap-x-3 md:grid-cols-[1fr_52px_1fr] md:gap-x-6";
  if (count === 3) return "grid-cols-2 md:grid-cols-3";
  if (count === 4) return "grid-cols-2 md:grid-cols-4";
  return "grid-cols-2 md:grid-cols-3 lg:grid-cols-5";
}

export function ComparePlinths({ shoes, onRemove, onAdd, canAdd, showRatingDetail = false }: Props) {
  const { translate } = useLocale();
  const count = shoes.length;
  const hideDescriptor = count >= 4;
  const tagLimit = count >= 4 ? 2 : count >= 3 ? 3 : 4;
  const showAddGhost = count === 1 && canAdd;
  const gridClass = gridTemplate(count, showAddGhost);

  const plinthProps = (shoe: Shoe) => ({
    shoe,
    hideDescriptor,
    tagLimit,
    onRemove,
    showRatingDetail,
    translateLabel: translate
  });

  return (
    <div className={`grid items-start gap-x-3 gap-y-8 sm:gap-x-6 sm:gap-y-10 ${gridClass}`}>
      {count === 2 ? (
        <>
          <ShoePlinth {...plinthProps(shoes[0])} />
          <div className="hidden flex-col items-center justify-center pt-24 opacity-50 md:flex">
            <div
              className="w-px"
              style={{ height: 90, background: "linear-gradient(to bottom, transparent, rgb(var(--muted)/0.55))" }}
            />
            <span className="my-3 text-sm font-medium tracking-[0.12em] soft-text">/</span>
            <div
              className="w-px"
              style={{ height: 90, background: "linear-gradient(to bottom, rgb(var(--muted)/0.55), transparent)" }}
            />
          </div>
          <ShoePlinth {...plinthProps(shoes[1])} />
        </>
      ) : (
        shoes.map((shoe) => <ShoePlinth key={shoe.id} {...plinthProps(shoe)} />)
      )}
      {showAddGhost ? <AddShoeGhost onClick={onAdd} label={translate("Add shoe")} /> : null}
    </div>
  );
}

function ShoePlinth({
  shoe,
  hideDescriptor,
  tagLimit,
  onRemove,
  showRatingDetail,
  translateLabel
}: {
  shoe: Shoe;
  hideDescriptor: boolean;
  tagLimit: number;
  onRemove: (id: string) => void;
  showRatingDetail: boolean;
  translateLabel: (value: string) => string;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      <button
        type="button"
        onClick={() => onRemove(shoe.id)}
        aria-label={translateLabel("Remove shoe from compare")}
        className="absolute right-1 top-1 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.85)] soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))] md:h-7 md:w-7"
      >
        <X className="h-4 w-4 md:h-3.5 md:w-3.5" />
      </button>

      <div className="relative mb-3 flex min-h-[120px] items-center justify-center overflow-hidden rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.28)] bg-[rgb(var(--surface))] px-3 py-4 shadow-[0_40px_80px_rgb(var(--shadow)/0.45)] sm:min-h-[160px] sm:mb-5 sm:px-4 sm:py-6 md:min-h-[240px] md:px-10 md:py-14">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 40%, rgb(var(--text)/0.06), transparent 70%)"
          }}
        />
        <ShoeImage
          src={shoe.image_url}
          alt={shoe.shoe_name}
          fallbackLabel={translateLabel("No image")}
          variant="compare"
          className="relative w-full max-w-[18rem] transition-transform duration-[420ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.04]"
        />
      </div>

      <p className="t-eyebrow mb-1 text-[0.6rem] sm:text-[0.67rem]">
        {shoe.brand}
        {shoe.release_year ? (
          <span className="ml-2 text-[rgb(var(--subtext))]">· {shoe.release_year}</span>
        ) : null}
      </p>
      <h2 className="mb-2 text-[1rem] font-extrabold leading-tight tracking-[-0.025em] sm:mb-3 sm:text-[1.25rem] md:text-[1.5rem] lg:text-[1.75rem]">
        {shoe.shoe_name}
      </h2>

      <div className="mb-3">
        <StarRatingSlot
          value={shoe.finalStars ?? null}
          size="sm"
          showNumber
          count={shoe.userRatingCount ?? 0}
        />
      </div>

      {showRatingDetail && shoe.dimStars ? (
        <div className="mb-4 rounded-2xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.4)] p-3">
          <DimRatingList stars={shoe.dimStars} size="sm" />
        </div>
      ) : null}

      {!hideDescriptor && shoe.spec.playstyle_summary ? (
        <DynamicTranslatedText
          as="p"
          className="mb-3 max-w-[340px] text-[0.78rem] leading-[1.45] soft-text sm:mb-4 sm:text-[0.82rem] sm:leading-[1.5]"
          text={shoe.spec.playstyle_summary}
          contentType="descriptive"
        />
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {(shoe.spec.tags ?? []).slice(0, tagLimit).map((tag) => (
          <Badge key={tag}>
            <DynamicTranslatedText as="span" text={tag} contentType="descriptive" />
          </Badge>
        ))}
      </div>
    </motion.div>
  );
}

function AddShoeGhost({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[rgb(var(--muted)/0.55)] bg-[rgb(var(--bg-elev)/0.3)] px-6 py-10 soft-text transition hover:border-[rgb(var(--text)/0.45)] hover:text-[rgb(var(--text))]"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.6)] transition group-hover:border-[rgb(var(--text)/0.45)]">
        <Plus className="h-5 w-5" />
      </span>
      <span className="text-sm font-medium tracking-[-0.01em]">{label}</span>
    </button>
  );
}
