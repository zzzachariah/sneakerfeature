"use client";

import { useCallback } from "react";
import { track } from "@vercel/analytics";
import { useCookieConsent } from "@/components/consent/cookie-consent";
import { canMeasureProduct, productEventPayload, type ProductEvent } from "@/lib/product-events";

export function useProductEvent() {
  const { consent, ready, blocked } = useCookieConsent();
  return useCallback((event: ProductEvent) => {
    if (!canMeasureProduct(consent, ready, blocked)) return;
    try { track(event.name, productEventPayload(event)); } catch { /* Analytics never blocks a user action. */ }
  }, [consent, ready, blocked]);
}
