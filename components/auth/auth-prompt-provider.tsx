"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AuthPromptModal } from "@/components/auth/auth-prompt-modal";

type OpenOptions = { reason?: string; next?: string };

type AuthPromptContextValue = {
  openAuthPrompt: (opts?: OpenOptions) => void;
  closeAuthPrompt: () => void;
};

// Safe no-op default so shared components (e.g. StarRating) never crash if they
// render outside the provider. Mirrors the defensive style of useAuthState().
const NOOP_VALUE: AuthPromptContextValue = {
  openAuthPrompt: () => {},
  closeAuthPrompt: () => {},
};

const AuthPromptContext = createContext<AuthPromptContextValue | null>(null);

export function AuthPromptProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [next, setNext] = useState<string | null>(null);

  const openAuthPrompt = useCallback((opts?: OpenOptions) => {
    setReason(opts?.reason ?? null);
    setNext(opts?.next ?? null);
    setOpen(true);
  }, []);

  const closeAuthPrompt = useCallback(() => setOpen(false), []);

  const value = useMemo<AuthPromptContextValue>(
    () => ({ openAuthPrompt, closeAuthPrompt }),
    [openAuthPrompt, closeAuthPrompt]
  );

  return (
    <AuthPromptContext.Provider value={value}>
      {children}
      <AuthPromptModal open={open} reason={reason} next={next} onClose={closeAuthPrompt} />
    </AuthPromptContext.Provider>
  );
}

export function useAuthPrompt() {
  return useContext(AuthPromptContext) ?? NOOP_VALUE;
}
