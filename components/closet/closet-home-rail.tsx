"use client";

// The closet's home-page presence: a compact horizontal rail of the member's
// active rotation (shoe, mini wear meter, hours) linking into /closet. Members
// choose WHERE it appears via the home-order personalization (lib/home/
// sections.ts id "closet"); each premium home also mounts it in its own spot.
// Renders nothing for signed-out visitors; signed-in members with an empty
// closet get a one-line starter card instead of dead air.

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { ArrowRight, ShoppingBag } from "lucide-react";
import type { Shoe } from "@/lib/types";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { usePremiumVariant } from "@/components/premium/variants";
import { ShoeImage } from "@/components/shoe/shoe-image";
import { Reveal } from "@/components/motion/reveal";
import { WearMeter } from "@/components/closet/wear-meter";
import { wearRatio, wearStatus, WEAR_STATUS_LABEL, type ClosetItemRow } from "@/lib/closet/wear";

export function ClosetHomeRail({ shoes }: { shoes: Shoe[] }) {
  const { translate } = useLocale();
  const variant = usePremiumVariant();
  const { signedIn } = useAuthState();
  const [items, setItems] = useState<ClosetItemRow[] | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    fetch("/api/closet", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled && d?.ok && Array.isArray(d.items)) setItems(d.items as ClosetItemRow[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  if (!signedIn || items === null) return null;

  const byId = new Map(shoes.map((s) => [s.id, s]));
  const active = items
    .filter((i) => !i.retired)
    .map((item) => ({ item, shoe: byId.get(item.shoe_id) }))
    .filter((e): e is { item: ClosetItemRow; shoe: Shoe } => Boolean(e.shoe));

  if (active.length === 0) {
    return (
      <div className="container-shell py-6">
        <Link
          href={"/closet" as Route}
          className="group flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[rgb(var(--muted)/0.6)] bg-[rgb(var(--bg-elev)/0.4)] p-4 transition hover:border-[rgb(var(--brand)/0.5)] hover:bg-[rgb(var(--brand)/0.06)]"
        >
          <span className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--brand))]">
              <ShoppingBag className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-medium">{translate("Start your closet")}</span>
              <span className="text-[0.7rem] soft-text">
                {translate("Track wear, retirement and cost for the pairs you actually hoop in.")}
              </span>
            </span>
          </span>
          <ArrowRight className="h-4 w-4 soft-text transition group-hover:translate-x-0.5" aria-hidden />
        </Link>
      </div>
    );
  }

  return (
    <div className={`container-shell py-6 pui-closet pui-closet--${variant}`}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className={variant === "standard" ? "t-eyebrow" : "pui-closet-rail-title"}>
          {translate("My closet")}
          <span className="num-display ml-2 text-[0.72rem] soft-text">{active.length}</span>
        </h2>
        <Link
          href={"/closet" as Route}
          className="inline-flex items-center gap-1 text-[0.8rem] font-medium soft-text transition hover:text-[rgb(var(--text))]"
        >
          {translate("Open closet")}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      <ul className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:px-0">
        {active.slice(0, 8).map(({ item, shoe }, i) => {
          const status = wearStatus(Number(item.play_hours));
          return (
            <Reveal as="li" key={item.shoe_id} index={i} className="w-[10.5rem] shrink-0 snap-start">
              <Link
                href={"/closet" as Route}
                className={`pui-cell pui-cell--${variant} pui-cell--rail block h-full`}
              >
                <div className="pui-cell-stage">
                  <ShoeImage
                    src={shoe.image_url ?? undefined}
                    alt={`${shoe.brand} ${shoe.shoe_name}`}
                    fallbackLabel={shoe.shoe_name}
                    stage={variant === "standard"}
                    className="pui-cell-img"
                  />
                </div>
                <div className="pui-cell-body">
                  <p className="pui-cell-name truncate text-[0.8rem]">{shoe.shoe_name}</p>
                  <div className="pui-cell-stats">
                    <span className="num-display">{Math.round(Number(item.play_hours) * 10) / 10}h</span>
                    <span aria-hidden>·</span>
                    <span>
                      <span className="num-display">{item.sessions}</span> {translate("runs")}
                    </span>
                  </div>
                  <WearMeter
                    variant={variant}
                    ratio={wearRatio(Number(item.play_hours))}
                    status={status}
                    label={translate(WEAR_STATUS_LABEL[status])}
                  />
                </div>
              </Link>
            </Reveal>
          );
        })}
      </ul>
    </div>
  );
}
