"use client";

import { useEffect } from "react";

// Records a shoe view for the signed-in user (fire-and-forget) so the weekly
// personalized digest knows what they've been looking at. Renders nothing.
export function RecordView({ shoeId, isLoggedIn }: { shoeId: string; isLoggedIn: boolean }) {
  useEffect(() => {
    if (!isLoggedIn || !shoeId) return;
    const controller = new AbortController();
    void fetch("/api/views", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoeId }),
      signal: controller.signal,
      keepalive: true
    }).catch(() => {
      /* best-effort; ignore network errors */
    });
    return () => controller.abort();
  }, [shoeId, isLoggedIn]);

  return null;
}
