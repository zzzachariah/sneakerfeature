import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * A unique-enough id for a client-side object with a lifetime — a court
 * session, a Live Activity. crypto.randomUUID() isn't in every WebView we ship
 * into, and these ids never leave the device, so the fallback is fine.
 */
export function randomId(prefix = "id"): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    /* not available in this context */
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function formatCurrency(value: number | null) {
  if (!value) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}
