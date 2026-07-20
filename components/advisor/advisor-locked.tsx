"use client";

// The advisor's gate for everyone who isn't Max: signed-out visitors and
// Pro/free members. A single premium upsell panel that states what the advisor
// is and routes to /subscribe (or /login). Themed by the active skin like the
// rest of the premium surface.

import Link from "next/link";
import type { Route } from "next";
import { Sparkles, Lock, MessagesSquare, ShieldCheck, Footprints } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { usePremiumVariant } from "@/components/premium/variants";
import { PremiumMasthead } from "@/components/premium/page/premium-masthead";
import { SignInValue } from "@/components/auth/sign-in-value";
import { Button } from "@/components/ui/button";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import type { Tier } from "@/lib/subscription/tiers";

const FEATURES: { icon: typeof MessagesSquare; title: string; body: string }[] = [
  {
    icon: MessagesSquare,
    title: "Remembers your conversation",
    body: "Ask follow-ups naturally — it keeps the thread and builds on what you've already told it."
  },
  {
    icon: Footprints,
    title: "Knows your feet & playstyle",
    body: "Every answer factors in your player profile and foot scan — width, arch, position, injuries."
  },
  {
    icon: ShieldCheck,
    title: "Honest, grounded picks",
    body: "It only recommends shoes that are really in the database — no invented models or specs."
  }
];

export function AdvisorLocked({ reason, tier }: { reason: "signed-out" | "tier"; tier?: Tier }) {
  const { translate } = useLocale();
  const variant = usePremiumVariant();

  return (
    <main className="container-shell has-mobile-nav-pad py-8 md:py-12">
      {variant === "standard" ? (
        <div className="mb-8">
          <p className="t-eyebrow mb-2 inline-flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5" style={{ color: "rgb(var(--gold-ink))" }} aria-hidden />
            {translate("AI Advisor")}
            <span
              className="rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide"
              style={{ color: "#1a1305", background: "linear-gradient(135deg, #ffe38a, #c99a2a)" }}
            >
              Max
            </span>
          </p>
          <h1 className="t-display-sm" style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
            {translate("Your personal sneaker concierge")}
          </h1>
          <p className="mt-2 max-w-[52ch] text-sm soft-text">
            {translate("A chat that remembers your playstyle and feet, and talks you through the right pair — for Max members.")}
          </p>
        </div>
      ) : (
        <PremiumMasthead
          variant={variant}
          kicker={translate("AI Advisor")}
          title={translate("Your personal sneaker concierge")}
          subtitle={translate("A chat that remembers your playstyle and feet, and talks you through the right pair — for Max members.")}
          meta="Max"
        />
      )}

      <div className="mx-auto grid max-w-3xl gap-3 sm:grid-cols-3">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="glass-lite rounded-2xl p-4">
              <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--brand)/0.12)] text-[rgb(var(--brand))]">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <p className="text-sm font-semibold">{translate(f.title)}</p>
              <p className="mt-1 text-xs leading-relaxed soft-text">{translate(f.body)}</p>
            </div>
          );
        })}
      </div>

      <div className="mx-auto mt-6 max-w-3xl">
        <div
          className="flex flex-col items-center gap-4 rounded-2xl border p-6 text-center"
          style={{
            borderColor: "rgba(217,180,90,0.3)",
            background: "linear-gradient(180deg, rgba(217,180,90,0.08), transparent)"
          }}
        >
          <span
            className="inline-flex h-12 w-12 items-center justify-center rounded-full"
            style={{ background: "linear-gradient(135deg, #f0d488, #b8912f)", color: "#1a1305" }}
          >
            <Lock className="h-5 w-5" aria-hidden />
          </span>
          {reason === "signed-out" ? (
            <>
              <p className="max-w-[40ch] text-sm soft-text">
                {translate("Sign in with a Max membership to chat with your advisor.")}
              </p>
              <div className="w-full max-w-xs">
                <SignInValue />
                <Link href={"/login?next=/advisor" as Route} className="mt-4 block">
                  <Button className="w-full rounded-xl">{translate("Log in")}</Button>
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="max-w-[42ch] text-sm soft-text">
                {tier === "pro"
                  ? translate("The advisor is a Max feature. Upgrade from Pro to unlock it.")
                  : translate("The advisor is a Max feature. Upgrade to Max to unlock it.")}
              </p>
              {SUBSCRIBE_LIVE ? (
                <Link href={"/subscribe" as Route} className="block w-full max-w-xs">
                  <Button className="w-full rounded-xl">{translate("See Max membership")}</Button>
                </Link>
              ) : null}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
