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
  loaded: false
};

const AuthStateContext = createContext<AuthState>(DEFAULT_STATE);

type CachedRole = { username: string | null; isAdmin: boolean; tier?: Tier; skin?: SkinId };

function readCachedRole(userId: string): CachedRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`sneaker-role:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRole;
    if (typeof parsed?.isAdmin !== "boolean") return null;
    return { username: parsed.username ?? null, isAdmin: parsed.isAdmin, tier: parsed.tier, skin: parsed.skin };
  } catch {
    return null;
  }
}

function writeCachedRole(userId: string, role: CachedRole) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`sneaker-role:${userId}`, JSON.stringify(role));
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
        loaded: true
      });

      const { data } = await sb.from("profiles").select("username, role").eq("id", userId).maybeSingle();
      if (cancelled) return;

      const username = data?.username ?? null;
      const isAdmin = data?.role === "admin";

      // Membership fields live behind migration 041 — fetch them separately and
      // tolerantly so a pre-migration deployment still resolves username/role.
      let tier: Tier = "free";
      let skin: SkinId = DEFAULT_SKIN;
      try {
        const { data: sub } = await sb
          .from("profiles")
          .select("subscription_tier, subscription_expires_at, subscription_is_permanent, member_prefs")
          .eq("id", userId)
          .maybeSingle();
        if (!cancelled && sub) {
          tier = isAdmin ? "max" : resolveTier(sub).tier; // admins get Max treatment in the UI
          skin = parseMemberPrefs(sub.member_prefs).skin;
        } else if (isAdmin) {
          tier = "max";
        }
      } catch {
        if (isAdmin) tier = "max";
      }
      if (cancelled) return;

      writeCachedRole(userId, { username, isAdmin, tier, skin });
      setState({
        session,
        signedIn: true,
        userId,
        email,
        username,
        isAdmin,
        tier,
        skin,
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
