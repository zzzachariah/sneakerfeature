"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type AuthState = {
  session: Session | null;
  signedIn: boolean;
  userId: string | null;
  email: string | null;
  username: string | null;
  isAdmin: boolean;
  loaded: boolean;
};

const DEFAULT_STATE: AuthState = {
  session: null,
  signedIn: false,
  userId: null,
  email: null,
  username: null,
  isAdmin: false,
  loaded: false
};

const AuthStateContext = createContext<AuthState>(DEFAULT_STATE);

type CachedRole = { username: string | null; isAdmin: boolean };

function readCachedRole(userId: string): CachedRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(`snkr-role:${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedRole;
    if (typeof parsed?.isAdmin !== "boolean") return null;
    return { username: parsed.username ?? null, isAdmin: parsed.isAdmin };
  } catch {
    return null;
  }
}

function writeCachedRole(userId: string, role: CachedRole) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(`snkr-role:${userId}`, JSON.stringify(role));
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
        loaded: true
      });

      const { data } = await sb
        .from("profiles")
        .select("username, role")
        .eq("id", userId)
        .maybeSingle();
      if (cancelled) return;

      const username = data?.username ?? null;
      const isAdmin = data?.role === "admin";
      writeCachedRole(userId, { username, isAdmin });
      setState({
        session,
        signedIn: true,
        userId,
        email,
        username,
        isAdmin,
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
