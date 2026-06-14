"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const AUTH_PATHS = new Set([
  "/login",
  "/signup",
  "/register",
  "/forgot-password",
  "/reset-password"
]);

export const LAST_PATH_KEY = "sneaker:last-path";

/**
 * Records the last non-auth route so the login page can send the user back to
 * where they were instead of the default dashboard. Records pathname + query so
 * stateful pages (e.g. /compare?ids=…) restore correctly.
 */
export function RouteMemory() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || typeof window === "undefined") return;
    if (AUTH_PATHS.has(pathname) || pathname.startsWith("/admin")) return;
    try {
      window.sessionStorage.setItem(LAST_PATH_KEY, window.location.pathname + window.location.search);
    } catch {
      /* sessionStorage unavailable — ignore */
    }
  }, [pathname]);

  return null;
}
