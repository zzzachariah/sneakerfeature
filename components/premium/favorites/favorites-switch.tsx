"use client";

// Favorites variant gate. Standard / Editorial / Instrument keep the untouched
// FavoritesView (the premium look comes entirely from the site-wide CSS). Gallery
// swaps the grid for the hairline index; Arena adds a "starting five" lineup rail
// above the saved grid.

import type { Shoe } from "@/lib/types";
import { FavoritesView } from "@/components/favorites/favorites-view";
import { GalleryCatalogue } from "@/components/premium/home/gallery-catalogue";
import { ArenaLineup } from "@/components/premium/home/arena-lineup";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePremiumVariant } from "@/components/premium/variants";

type Props = { shoes: Shoe[]; signedIn: boolean };

export function FavoritesSwitch(props: Props) {
  const variant = usePremiumVariant();
  if (variant === "gallery") return <GalleryFavorites {...props} />;
  if (variant === "arena") return <ArenaFavorites {...props} />;
  return <FavoritesView {...props} />;
}

function GalleryFavorites({ shoes, signedIn }: Props) {
  const { translate } = useLocale();
  const { favorites, loaded } = useFavorites();
  const visible = shoes.filter((s) => !loaded || favorites.has(s.id));

  // Reuse FavoritesView's signed-out / empty states rather than reimplement them.
  if (!signedIn || visible.length === 0) return <FavoritesView shoes={shoes} signedIn={signedIn} />;

  return (
    <main className="container-shell has-mobile-nav-pad py-8 md:py-12">
      <p className="t-eyebrow mb-2">{translate("Saved")}</p>
      <h1 className="t-display-sm mb-6" style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
        {translate("Saved shoes")}
      </h1>
      <GalleryCatalogue shoes={visible} />
    </main>
  );
}

function ArenaFavorites({ shoes, signedIn }: Props) {
  const { translate } = useLocale();
  return (
    <>
      {signedIn ? (
        <section className="container-shell pt-8">
          <p className="pui-kicker mb-3">{translate("Your starting five")}</p>
          <ArenaLineup shoes={shoes} />
        </section>
      ) : null}
      <FavoritesView shoes={shoes} signedIn={signedIn} />
    </>
  );
}
