"use client";

import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState } from "react";
import { Heart } from "lucide-react";
import type { Shoe } from "@/lib/types";
import { ShoeCard } from "@/components/home/shoe-card";
import { SignInValue } from "@/components/auth/sign-in-value";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePremiumVariant } from "@/components/premium/variants";
import { PremiumMasthead } from "@/components/premium/page/premium-masthead";
import { haptics } from "@/lib/native/haptics";

type SortKey = "saved" | "rating" | "name";

export function FavoritesView({ shoes, signedIn }: { shoes: Shoe[]; signedIn: boolean }) {
  const { translate } = useLocale();
  const variant = usePremiumVariant();
  const { favorites, loaded } = useFavorites();
  const [sort, setSort] = useState<SortKey>("saved");

  // The grid is driven by the *live* favorites set, not just the server
  // snapshot, so un-saving a shoe (via its heart) removes it from the shelf
  // immediately instead of lingering until reload. Before the client set
  // finishes loading we show the server snapshot to avoid an empty flash.
  const visible = useMemo(() => {
    const base = shoes.filter((s) => !loaded || favorites.has(s.id));
    if (sort === "rating") return [...base].sort((a, b) => (b.finalStars ?? 0) - (a.finalStars ?? 0));
    if (sort === "name") return [...base].sort((a, b) => a.shoe_name.localeCompare(b.shoe_name));
    return base;
  }, [shoes, favorites, loaded, sort]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "saved", label: translate("Saved") },
    { key: "rating", label: translate("Rating") },
    { key: "name", label: translate("A–Z") },
  ];

  const sortGroup =
    signedIn && visible.length > 1 ? (
      <div
        role="group"
        aria-label={translate("Sort")}
        className="glass-lite inline-flex items-center gap-0.5 rounded-full p-1"
      >
        {sortOptions.map((o) => {
          const active = sort === o.key;
          return (
            <button
              key={o.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                haptics.selection();
                setSort(o.key);
              }}
              className={`rounded-full px-3 py-1.5 text-[0.8rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--ring)/0.3)] ${
                active
                  ? "bg-[rgb(var(--text))] text-[rgb(var(--bg))]"
                  : "text-[rgb(var(--subtext))] hover:text-[rgb(var(--text))]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    ) : null;

  const savedCount =
    signedIn && visible.length > 0
      ? `${visible.length} ${translate(visible.length === 1 ? "shoe saved" : "shoes saved")}`
      : undefined;

  return (
    <main className="container-shell has-mobile-nav-pad py-8 md:py-12">
      {variant === "standard" ? (
        <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div>
            <p className="t-eyebrow mb-2">{translate("Saved")}</p>
            <h1 className="t-display-sm" style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
              {translate("Saved shoes")}
            </h1>
            {signedIn && visible.length > 0 ? (
              <p className="mt-1.5 text-sm soft-text">
                <span className="num-display">{visible.length}</span>{" "}
                {translate(visible.length === 1 ? "shoe saved" : "shoes saved")}
              </p>
            ) : null}
          </div>

          {sortGroup}
        </div>
      ) : (
        <>
          <PremiumMasthead variant={variant} kicker={translate("Saved")} title={translate("Saved shoes")} subtitle={savedCount} />
          {sortGroup ? <div className="mb-6 -mt-2 flex justify-end">{sortGroup}</div> : null}
        </>
      )}

      {!signedIn ? (
        <EmptyState
          align="start"
          icon={Heart}
          title={translate("Save shoes you're considering")}
          description={translate("Sign in to keep a shelf of shoes and sync it across your devices.")}
        >
          <div className="text-left">
            <SignInValue />
            <Link href={"/login?next=/favorites" as Route} className="mt-5 block">
              <Button className="w-full rounded-xl">{translate("Log in")}</Button>
            </Link>
          </div>
        </EmptyState>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={translate("No saved shoes yet")}
          description={translate("Tap the heart on any shoe to add it to your shelf.")}
        >
          <Link href={"/" as Route} className="block">
            <Button className="w-full rounded-xl">{translate("Browse shoes")}</Button>
          </Link>
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {visible.map((shoe, i) => (
            <ShoeCard key={shoe.id} shoe={shoe} index={i} />
          ))}
        </ul>
      )}
    </main>
  );
}
