"use client";

import Link from "next/link";
import type { Route } from "next";
import type { Shoe } from "@/lib/types";
import { ShoeCard } from "@/components/home/shoe-card";
import { SignInValue } from "@/components/auth/sign-in-value";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/i18n/locale-provider";

export function FavoritesView({ shoes, signedIn }: { shoes: Shoe[]; signedIn: boolean }) {
  const { translate } = useLocale();
  return (
    <main className="container-shell has-mobile-nav-pad py-8 md:py-12">
      <p className="t-eyebrow mb-2">{translate("Saved")}</p>
      <h1 className="t-display-sm mb-6" style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
        {translate("Saved shoes")}
      </h1>

      {!signedIn ? (
        <div className="surface-card premium-border ios-glass-favorites-empty relative mx-auto max-w-sm rounded-2xl p-6 text-left">
          <p className="mb-3 text-sm text-[rgb(var(--text)/0.82)]">{translate("Sign in to save shoes.")}</p>
          <SignInValue />
          <Link href={"/login?next=/favorites" as Route} className="mt-5 block">
            <Button className="w-full rounded-xl">{translate("Log in")}</Button>
          </Link>
        </div>
      ) : shoes.length === 0 ? (
        <div className="surface-card premium-border ios-glass-favorites-empty relative mx-auto max-w-md rounded-2xl p-8 text-center">
          <p className="mb-4 text-sm soft-text">{translate("No saved shoes yet. Tap the heart on any shoe.")}</p>
          <Link href={"/" as Route} className="block">
            <Button className="w-full rounded-xl">{translate("Browse shoes")}</Button>
          </Link>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {shoes.map((shoe, i) => (
            <ShoeCard key={shoe.id} shoe={shoe} index={i} />
          ))}
        </ul>
      )}
    </main>
  );
}
