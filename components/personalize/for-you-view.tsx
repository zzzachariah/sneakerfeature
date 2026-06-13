"use client";

import Link from "next/link";
import type { Route } from "next";
import { Sparkles, GitCompareArrows, Star, ArrowRight, MessageCircle } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { DigestCompareShoe, DigestRecommendation } from "@/lib/personalize/digest";

type Digest = {
  compare_shoes: DigestCompareShoe[] | null;
  recommendations: DigestRecommendation[] | null;
} | null;

export function ForYouView({ digest, signedIn }: { digest: Digest; signedIn: boolean }) {
  const { translate } = useLocale();

  const compareShoes = digest?.compare_shoes ?? [];
  const recommendations = digest?.recommendations ?? [];
  const hasContent = compareShoes.length > 0 || recommendations.length > 0;

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10 sm:py-14">
      <header className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[rgb(var(--accent))]" />
        <h1 className="text-2xl font-semibold tracking-tight">{translate("Your weekly picks")}</h1>
      </header>
      <p className="mt-2 text-sm soft-text">
        {translate("We refresh these every Monday based on what you browse.")}
      </p>

      {!signedIn ? (
        <EmptyState text={translate("Sign in to see your weekly picks.")} ctaHref="/login" ctaLabel={translate("Log in")} />
      ) : !hasContent ? (
        <EmptyState
          text={translate("Browse a few shoes and your weekly picks will appear here.")}
          ctaHref="/"
          ctaLabel={translate("Browse shoes")}
        />
      ) : (
        <div className="mt-8 space-y-8">
          {compareShoes.length === 2 ? (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] soft-text">
                <GitCompareArrows className="h-4 w-4" /> {translate("A comparison for you")}
              </h2>
              <div className="surface-card premium-border mt-3 rounded-2xl p-5">
                <p className="text-sm">
                  <span className="font-medium">{compareShoes[0].name}</span>
                  <span className="soft-text"> {translate("vs")} </span>
                  <span className="font-medium">{compareShoes[1].name}</span>
                </p>
                <Link
                  href={`/compare?ids=${compareShoes[0].id},${compareShoes[1].id}` as Route}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
                >
                  {translate("Compare these two")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </section>
          ) : null}

          {recommendations.length > 0 ? (
            <section>
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] soft-text">
                <Sparkles className="h-4 w-4" /> {translate("Picked for you")}
              </h2>
              <ul className="mt-3 space-y-3">
                {recommendations.map((rec) => (
                  <li key={rec.id} className="surface-card premium-border rounded-2xl p-4">
                    <Link href={`/shoes/${rec.slug}`} className="group block">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium transition group-hover:text-[rgb(var(--accent))]">{rec.name}</p>
                        {typeof rec.stars === "number" ? (
                          <span className="inline-flex items-center gap-1 text-xs soft-text">
                            <Star className="h-3.5 w-3.5 fill-current text-amber-400" /> {rec.stars.toFixed(1)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 text-sm leading-6 soft-text">{rec.reason}</p>
                    </Link>
                  </li>
                ))}
              </ul>
              <Link
                href="/smart-picker"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[rgb(var(--accent))] hover:underline"
              >
                <MessageCircle className="h-4 w-4" /> {translate("Keep refining in Smart Picker")}
              </Link>
            </section>
          ) : null}
        </div>
      )}
    </main>
  );
}

function EmptyState({ text, ctaHref, ctaLabel }: { text: string; ctaHref: Route; ctaLabel: string }) {
  return (
    <div className="surface-card premium-border mt-8 flex flex-col items-center gap-3 rounded-2xl p-10 text-center">
      <Sparkles className="h-8 w-8 text-[rgb(var(--accent))]" />
      <p className="max-w-sm text-sm soft-text">{text}</p>
      <Link
        href={ctaHref}
        className="inline-flex h-10 items-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
      >
        {ctaLabel} <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
