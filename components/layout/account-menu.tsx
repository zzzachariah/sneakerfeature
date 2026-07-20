"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Heart, LogOut, LayoutDashboard, LogIn, Shield, ShoppingBag, Sparkles, UserCircle, UserPlus, Crown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import { useAuthState } from "@/components/auth/auth-state-provider";
import { MemberBadge } from "@/components/subscribe/member-badge";
import { SUBSCRIBE_LIVE } from "@/lib/subscription/flags";
import { isPaidTier } from "@/lib/subscription/tiers";
import { skinPalette } from "@/lib/subscription/skins";
import { cn } from "@/lib/utils";

export function AccountMenu({ className }: { className?: string }) {
  const { translate } = useLocale();
  const { signedIn, isAdmin, username, email, tier, subscriptionTier, skin, loaded } = useAuthState();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Paid members get a faint skin-accent halo on the avatar + a skin-tinted
  // presence dot, so their status reads at a glance from the top bar.
  const memberPal = isPaidTier(tier) ? skinPalette(skin, tier) : null;

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
      {loaded && !signedIn ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={translate("Log in")}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full bg-[rgb(var(--text)/0.06)] px-3 text-sm font-medium text-[rgb(var(--text))] transition-[background-color,color] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgb(var(--text)/0.1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] md:h-8",
            className
          )}
        >
          <LogIn className="h-4 w-4" />
          {translate("Log in")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={label}
          className={cn(
            "relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[rgb(var(--subtext))] transition-[background-color,color,box-shadow] duration-[200ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[rgb(var(--text)/0.08)] hover:text-[rgb(var(--text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.25)] md:h-8 md:w-8",
            className
          )}
          style={memberPal ? { boxShadow: "0 0 0 1px rgb(var(--brand) / 0.4), 0 0 12px -3px rgb(var(--brand))" } : undefined}
        >
          <UserCircle className="h-[20px] w-[20px] md:h-[18px] md:w-[18px]" style={memberPal ? { color: "rgb(var(--brand))" } : undefined} />
          <span className="sr-only" data-user-identity="true">{label}</span>
          {signedIn ? (
            <span
              aria-hidden
              className="absolute bottom-[4px] right-[4px] h-1.5 w-1.5 rounded-full ring-2 ring-[rgb(var(--bg))]"
              style={{ backgroundColor: memberPal ? "rgb(var(--brand))" : "rgb(var(--text))" }}
            />
          ) : null}
        </button>
      )}

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
                {SUBSCRIBE_LIVE && (
                  <Link
                    href="/subscribe"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                  >
                    <Crown className="h-4 w-4" style={{ color: "rgb(var(--gold-ink))" }} />
                    {translate("Membership")}
                  </Link>
                )}
              </>
            ) : (
              <>
                {/* Signed-in identity header (replaces the old left-side tooltip). */}
                <div className="mb-1 border-b border-[rgb(var(--glass-stroke-soft)/0.4)] px-3 pb-2 pt-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-[rgb(var(--text))]">
                    <span className="truncate">{username || email?.split("@")[0] || translate("Account")}</span>
                    {/* The badge names the member's actual plan — subscriptionTier,
                        so admins aren't shown as Max unless they really are. */}
                    <MemberBadge tier={subscriptionTier} skin={skin} />
                  </p>
                  {email ? <p className="mt-0.5 truncate text-xs soft-text">{email}</p> : null}
                </div>

                <Link
                  href="/dashboard"
                  prefetch={true}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                >
                  <LayoutDashboard className="h-4 w-4" />
                  {translate("Dashboard")}
                </Link>

                <Link
                  href="/favorites"
                  prefetch={true}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                >
                  <Heart className="h-4 w-4" />
                  {translate("Saved shoes")}
                </Link>

                <Link
                  href="/closet"
                  prefetch={true}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {translate("My closet")}
                </Link>

                <Link
                  href="/advisor"
                  prefetch={true}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                >
                  <Sparkles className="h-4 w-4" />
                  {translate("AI Advisor")}
                </Link>

                {(SUBSCRIBE_LIVE || isAdmin) && (
                  <Link
                    href="/subscribe"
                    prefetch={true}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-[rgb(var(--text))] transition hover:bg-[rgb(var(--text)/0.07)]"
                  >
                    <Crown className="h-4 w-4" style={{ color: "rgb(var(--gold-ink))" }} />
                    {translate("Membership")}
                  </Link>
                )}

                {isAdmin && (
                  <Link
                    href="/admin"
                    prefetch={true}
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
