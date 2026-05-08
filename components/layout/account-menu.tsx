"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, LayoutDashboard, LogIn, Shield, UserCircle, UserPlus } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { cn } from "@/lib/utils";

export function AccountMenu({ className }: { className?: string }) {
  const { translate } = useLocale();
  const { signedIn, isAdmin, username, email } = useAuthState();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const label = signedIn ? username || email?.split("@")[0] || "Account" : translate("Account");

  useEffect(() => {
    function onPointerDownOutside(e: PointerEvent) {
      const target = e.target as Node;
      if (wrapperRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDownOutside);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("pointerdown", onPointerDownOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  async function logout() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--subtext))] transition-[background-color,color] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] md:h-8 md:w-8",
          className
        )}
      >
        <UserCircle className="h-[20px] w-[20px] md:h-[18px] md:w-[18px]" />
        <span className="sr-only" data-user-identity="true">{label}</span>
        {signedIn ? (
          <span
            aria-hidden
            className="absolute bottom-[4px] right-[4px] h-1.5 w-1.5 rounded-full bg-[rgb(var(--text))] ring-2 ring-[rgb(var(--bg))]"
          />
        ) : null}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.985 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="nav-dropdown-panel absolute right-0 top-full z-[70] mt-2 w-56 min-w-full origin-top-right rounded-2xl p-1.5"
            role="menu"
          >
            {!signedIn ? (
              <>
                <Link
                  href="/login"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                >
                  <LogIn className="h-4 w-4" />
                  {translate("Log in")}
                </Link>
                <Link
                  href="/signup"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                >
                  <UserPlus className="h-4 w-4" />
                  {translate("Sign up")}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/dashboard"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {translate("Dashboard")}
                </Link>

                {isAdmin && (
                  <Link
                    href="/admin"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                  >
                    <Shield className="h-4 w-4" />
                    {translate("Admin")}
                  </Link>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={logout}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                >
                  <LogOut className="h-4 w-4" />
                  {translate("Log out")}
                </button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
