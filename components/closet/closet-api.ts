"use client";

// Thin typed fetch helpers for the closet routes, shared by the sheets and the
// native (iOS action-sheet) flows so every surface mutates the same way.

import type { ClosetItemRow, WearLogRow } from "@/lib/closet/wear";

type ApiResult<T> = ({ ok: true } & T) | { ok: false; message?: string; code?: string };

async function call<T>(url: string, method: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    return (await res.json()) as ApiResult<T>;
  } catch {
    return { ok: false, message: "Network error. Please try again." };
  }
}

export function addToCloset(input: {
  shoeId: string;
  sizeLabel?: string;
  purchasePrice?: number | null;
  purchasedAt?: string | null;
}) {
  return call<{ item: ClosetItemRow }>("/api/closet", "POST", input);
}

export function patchCloset(input: {
  shoeId: string;
  sizeLabel?: string | null;
  purchasePrice?: number | null;
  purchasedAt?: string | null;
  retired?: boolean;
}) {
  return call<{ item: ClosetItemRow }>("/api/closet", "PATCH", input);
}

export function removeFromCloset(shoeId: string) {
  return call<Record<string, never>>("/api/closet", "DELETE", { shoeId });
}

export function logWear(input: { shoeId: string; hours: number; note?: string; playedAt?: string }) {
  return call<{ log: WearLogRow; item: ClosetItemRow }>("/api/closet/wear", "POST", input);
}

export function fetchWearLogs() {
  return call<{ logs: WearLogRow[] }>("/api/closet/wear", "GET");
}
