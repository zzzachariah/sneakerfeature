"use client";
import { useEffect, useState } from "react";
import { DEFAULT_MODEL_CATALOG, modelCatalogSchema, type ModelCatalog } from "./model-catalog";

// Refresh on entry, focus and every minute; no provider credentials in browsers.
export function useModelCatalog(initial: ModelCatalog = DEFAULT_MODEL_CATALOG) {
  const [catalog, setCatalog] = useState(initial);
  useEffect(() => {
    let disposed = false;
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const res = await fetch("/api/ai/models", { cache: "no-store", signal: controller.signal });
        if (!res.ok) return;
        const parsed = modelCatalogSchema.safeParse(await res.json());
        if (!disposed && parsed.success) setCatalog(parsed.data);
      } catch { /* Keep the last valid display during a transient outage. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { disposed = true; controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, []);
  return catalog;
}
