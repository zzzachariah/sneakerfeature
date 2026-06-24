"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Shield, X } from "lucide-react";
import { AdminNav, type AdminNavCounts, findActiveNavItem } from "@/components/admin/admin-nav";
import { AdminLogoutButton } from "@/components/admin/admin-logout-button";
import { useBodyScrollLock } from "@/lib/hooks/use-body-scroll-lock";

/** Mobile-only admin chrome: a sticky top bar with the current section name
 * and a hamburger button, plus the slide-in drawer that lifts off the left
 * edge with the full grouped nav. Desktop renders the existing sidebar
 * unchanged. */
export function AdminMobileShell({
  username,
  counts
}: {
  username: string;
  counts: AdminNavCounts;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "";
  const active = findActiveNavItem(pathname);

  // Close the drawer automatically when the route changes — a tap on a nav
  // link triggers usePathname() to update.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useBodyScrollLock(open);

  // Escape-key dismissal for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div
        className="surface-card premium-border sticky top-0 z-30 -mx-4 mb-3 flex items-center gap-3 rounded-none px-4 py-3 lg:hidden"
        style={{ top: "var(--safe-top, 0px)" }}
      >
        <button
          type="button"
          aria-label="Open admin navigation"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--bg-elev)/0.8)] text-[rgb(var(--text))] transition active:scale-95"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-[rgb(var(--accent))]">
            Admin · {username}
          </p>
          <p className="truncate text-sm font-semibold tracking-[-0.01em]">
            {active?.label ?? "Admin"}
          </p>
        </div>
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[rgb(var(--accent)/0.12)] text-[rgb(var(--accent))]">
          <Shield className="h-4 w-4" />
        </span>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            key="scrim"
            className="fixed inset-0 z-[110] bg-[rgb(var(--glass-overlay)/0.45)] backdrop-blur-[10px] lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => setOpen(false)}
          >
            <motion.aside
              key="drawer"
              role="dialog"
              aria-label="Admin navigation"
              onClick={(e) => e.stopPropagation()}
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 360, damping: 36 }}
              className="glass-strong glass-rim absolute inset-y-0 left-0 flex w-[85vw] max-w-[340px] flex-col"
              style={{
                paddingTop: "max(1rem, var(--safe-top))",
                paddingBottom: "max(1rem, var(--safe-bottom))"
              }}
            >
              <div className="flex shrink-0 items-start gap-3 px-5 pb-4 pt-2">
                <div className="min-w-0 flex-1 rounded-xl border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.55)] p-3">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] soft-text">
                    Admin mode
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-[rgb(var(--accent))]" />
                    <p className="truncate font-medium">{username}</p>
                  </div>
                  <p className="mt-1 text-xs text-[rgb(var(--accent))]">role: admin</p>
                </div>
                <button
                  type="button"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--text)/0.6)] transition hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-3">
                <AdminNav counts={counts} onNavigate={() => setOpen(false)} />
              </div>

              <div className="shrink-0 border-t border-[rgb(var(--glass-stroke-soft)/0.4)] px-5 pt-4">
                <AdminLogoutButton />
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
