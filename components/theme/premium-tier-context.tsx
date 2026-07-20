"use client";

// Per-tier render state for the Premium UI — the tier mirror of
// PremiumSkinProvider. The SKIN decides a page's structural LANGUAGE
// (editorial / instrument / gallery / arena); the TIER decides how that language
// is COMPOSED for the member: Pro reads the skin's native order, Max gets an
// analysis-first "concierge" cut plus the Max masthead signal.
//
// Why a context (and not just useAuthState): the premium <XSwitch>es render on
// the SERVER too, where auth isn't resolved yet — a Max member would first-paint
// in the Pro structure and pop on hydration. So the tier is seeded on the server
// from the sf-member-tier cookie (app/layout.tsx), exactly like the skin cookie
// seeds the variant, and PremiumTierSync then reconciles it to real auth once —
// same "server hint, client truth" contract the skin uses.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Tier } from "@/lib/subscription/tiers";
import { useAuthState } from "@/components/auth/auth-state-provider";

type PremiumTierContextValue = {
  tier: Tier;
  setTier: (tier: Tier) => void;
};

// Degrades to "free" (→ the skin's native / Pro composition) when used outside a
// provider, so an accidental bare render never crashes or over-grants Max.
const PremiumTierContext = createContext<PremiumTierContextValue>({
  tier: "free",
  setTier: () => {},
});

export function PremiumTierProvider({
  initialTier,
  children,
}: {
  initialTier: Tier;
  children: ReactNode;
}) {
  // Seeded from the server (cookie) value so the first client render matches SSR.
  const [tier, setTier] = useState<Tier>(initialTier);
  const value = useMemo(() => ({ tier, setTier }), [tier]);
  return <PremiumTierContext.Provider value={value}>{children}</PremiumTierContext.Provider>;
}

/** The member's effective tier for premium composition (admins resolve to max). */
export function usePremiumTier(): Tier {
  return useContext(PremiumTierContext).tier;
}

// Mounted INSIDE AuthStateProvider (below the provider): pushes the resolved tier
// into the context once auth loads, so every premium component re-renders in the
// member's real structure. An upgrade / downgrade reconciles here, once — the
// cookie write in MemberThemeApplier keeps the next SSR seed in step.
export function PremiumTierSync() {
  const { tier, loaded } = useAuthState();
  const { setTier } = useContext(PremiumTierContext);
  useEffect(() => {
    if (loaded) setTier(tier);
  }, [tier, loaded, setTier]);
  return null;
}
