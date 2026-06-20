"use client";

import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";
import { Heart } from "lucide-react";
import { useFavorites } from "@/components/favorites/favorites-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { useLocale } from "@/components/i18n/locale-provider";

// Heart toggle. Signed-out users are sent to log in (returning here). Works
// inside a card <Link> — it stops propagation so it never triggers navigation.
export function FavoriteButton({
  shoeId,
  className = "",
  iconClassName = "h-4 w-4",
  showLabel = false
}: {
  shoeId: string;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
}) {
  const { isFavorite, toggle } = useFavorites();
  const { signedIn } = useAuthState();
  const router = useRouter();
  const pathname = usePathname();
  const { translate } = useLocale();
  const fav = isFavorite(shoeId);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!signedIn) {
          router.push(`/login?next=${encodeURIComponent(pathname)}` as Route);
          return;
        }
        void toggle(shoeId);
      }}
      aria-pressed={fav}
      aria-label={translate(fav ? "Saved" : "Save")}
      className={`inline-flex items-center justify-center gap-1.5 transition active:scale-90 ${className}`}
    >
      <Heart className={`${iconClassName} ${fav ? "fill-[rgb(var(--brand))] text-[rgb(var(--brand))]" : "text-[rgb(var(--text)/0.7)]"}`} />
      {showLabel ? <span>{translate(fav ? "Saved" : "Save")}</span> : null}
    </button>
  );
}
