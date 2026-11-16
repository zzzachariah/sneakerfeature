"use client";

import { createContext, useContext } from "react";

const NonceContext = createContext<string | undefined>(undefined);

/** Makes the per-request CSP nonce available to client components (next/script). */
export function NonceProvider({ nonce, children }: { nonce?: string; children: React.ReactNode }) {
  return <NonceContext.Provider value={nonce}>{children}</NonceContext.Provider>;
}

export function useNonce(): string | undefined {
  return useContext(NonceContext);
}
