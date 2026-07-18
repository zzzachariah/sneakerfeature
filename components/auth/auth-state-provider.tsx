"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { resolveTier, parseMemberPrefs } from "@/lib/subscription/resolve";
import type { Tier } from "@/lib/subscription/tiers";
import { DEFAULT_SKIN, type SkinId } from "@/lib/subscription/skins";

type AuthState = {
  session: Session | null;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  username: string | null;
  isAdmin: boolean;
  tier: Tier;
  skin: SkinId;
  /** Max-only custom accent hex, or null. Threaded through so site-wide theming
   *  and badges can honor a member's "Signature" color. */
  customAccent: string | null;
  loaded: boolean;
};

const DEFAULT_STATE: AuthState = {
  session: null,
  signedIn: false,
  userId: null,
  email: null,
  username: null,
  isAdmin: false,
  tier: "free",
  skin: DEFAULT_SKIN,
  customAccent: null,
  loaded: false
};

const AuthStateContext = createContext<AuthState>(DEFAULT_STATE);

type CachedRole = { username: string | null; isAdmin: boolean; tier?: Tier; skin?: SkinId; customAccent?: string | null };

// Cached in localStorage (NOT sessionStorage) so a returning member opening a
// NEW tab resolves as their real tier/skin on first paint — sessionStorage is
// per-tab, which made a fresh tab render as `free` until the async fetch landed,
// briefly flashing the gold "Upgrade" pill and the default skin at a paying
// member. localStorage is shared across tabs, so the cached plan is there
// immediately.
function readCachedRole(userId: string): CachedRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`sneaker-role:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRole;
    if (typeof parsed?.isAdmin !== "boolean") return null;
    return { username: parsed.username ?? null, isAdmin: parsed.isAdmin, tier: parsed.tier, skin: parsed.skin, customAccent: parsed.customAccent ?? null };
  } catch {
    return null;
  }
}

function writeCachedRole(userId: string, role: CachedRole) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`sneaker-role:${userId}`, JSON.stringify(role));
  } catch {
    /* ignore */
  }
}

export function AuthStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>(DEFAULT_STATE);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setState({ ...DEFAULT_STATE, loaded: true });
      return;
    }
    const sb = supabase;
    let cancelled = false;

    async function syncFromSession(session: Session | null) {
      if (cancelled) return;
      const userId = session?.user?.id ?? null;
      if (!session || !userId) {
        setState({ ...DEFAULT_STATE, loaded: true });
        return;
      }

      const email = session.user.email ?? null;
      const cached = readCachedRole(userId);
      setState({
        session,
        signedIn: true,
        userId,
        email,
        username: cached?.username ?? null,
        isAdmin: cached?.isAdmin ?? false,
        tier: cached?.tier ?? "free",
        skin: cached?.skin ?? DEFAULT_SKIN,
        customAccent: cached?.customAccent ?? null,
        loaded: true
      });

      const { data, error } = await sb.from("profiles").select("username, role").eq("id", userId).maybeSingle();
      if (cancelled) return;

      // Resilience: if the base profile read failed (network blip, transient
      // error), KEEP the cached state rather than overwriting a known member
      // with `free`. The paid surface must never tell a paying member to
      // upgrade because of a flaky fetch — a later auth event re-syncs.
      if (error || !data) return;

      const username = data.username ?? cached?.username ?? null;
      const isAdmin = data.role === "admin";

      // Membership fields live behind migration 041 — fetch them separately and
      // tolerantly so a pre-migration deployment still resolves username/role.
      // Seed tier/skin from the cache so a failed sub-read also can't downgrade.
      let tier: Tier = isAdmin ? "max" : cached?.tier ?? "free";
      let skin: SkinId = cached?.skin ?? DEFAULT_SKIN;
      let customAccent: string | null = cached?.customAccent ?? null;
      try {
        const { data: sub, error: subError } = await sb
          .from("profiles")
          .select("subscription_tier, subscription_expires_at, subscription_is_permanent, member_prefs")
          .eq("id", userId)
          .maybeSingle();
        if (!cancelled && !subError && sub) {
          tier = isAdmin ? "max" : resolveTier(sub).tier; // admins get Max treatment in the UI
          const prefs = parseMemberPrefs(sub.member_prefs);
          skin = prefs.skin;
          customAccent = prefs.customAccent;
        }
      } catch {
        /* keep the cache-seeded tier/skin above */
      }
      if (cancelled) return;

      writeCachedRole(userId, { username, isAdmin, tier, skin, customAccent });
      setState({
        session,
        signedIn: true,
        userId,
        email,
        username,
        isAdmin,
        tier,
        skin,
        customAccent,
        loaded: true
      });
    }

    void sb.auth.getSession().then(({ data }) => syncFromSession(data.session));

    const { data: listener } = sb.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => state, [state]);

  return <AuthStateContext.Provider value={value}>{children}</AuthStateContext.Provider>;
}

export function useAuthState() {
  return useContext(AuthStateContext);
}
