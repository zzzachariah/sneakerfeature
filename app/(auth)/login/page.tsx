"use client";

import { useRef, useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { DUR, EASE } from "@/lib/motion/constants";
import { ArrowRight } from "lucide-react";
import { SneakerLoader } from "@/components/ui/sneaker-loader";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { HumanCheck } from "@/components/ui/human-check";
import { AuthShell } from "@/components/auth/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";
import { LAST_PATH_KEY } from "@/components/auth/route-memory";

const CLIENT_TIMEOUT_MS = 12000;
const SESSION_SYNC_TIMEOUT_MS = 5000;
const AUTH_PREFIXES = ["/login", "/signup", "/register", "/forgot-password", "/reset-password"];

const stagger = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } }
};
const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } }
};

function devLog(step: string, payload?: unknown) {
  if (process.env.NODE_ENV !== "production") {
    console.info(`[login] ${step}`, payload ?? "");
  }
}

function normalizeRedirectTarget(raw: string | null): Route {
  if (!raw) return "/dashboard" as Route;
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/dashboard" as Route;
  const path = raw.split("?")[0];
  // Never bounce back into an auth page (avoids login → login loops).
  if (AUTH_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`))) return "/dashboard" as Route;
  return raw as Route;
}

// After login, go back to where the user was: an explicit ?next= wins, else the
// last non-auth route we recorded, else the dashboard.
function readLastPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(LAST_PATH_KEY);
  } catch {
    return null;
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = CLIENT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function useTiltHandlers() {
  const rafRef = useRef(0);
  const pendingRef = useRef<{ el: HTMLElement; ty: number; tx: number } | null>(null);

  const flush = () => {
    rafRef.current = 0;
    const p = pendingRef.current;
    if (!p) return;
    p.el.style.setProperty("--tilt-y", `${p.ty}deg`);
    p.el.style.setProperty("--tilt-x", `${p.tx}deg`);
  };

  const onMove = (e: React.PointerEvent<HTMLElement>) => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    pendingRef.current = { el, ty: nx * 4, tx: ny * -4 };
    if (!rafRef.current) {
      rafRef.current = requestAnimationFrame(flush);
    }
  };

  const onLeave = (e: React.PointerEvent<HTMLElement>) => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    pendingRef.current = null;
    const el = e.currentTarget;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  return { onMove, onLeave };
}

export default function LoginPage() {
  const { translate } = useLocale();
  const reduce = useReducedMotion();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const tilt = useTiltHandlers();

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    devLog("form submit started");
    setError(false);
    setMessage("");
    setSubmitting(true);

    try {
      if (!verificationToken) {
        setError(true);
        setMessage("Please complete human verification.");
        return;
      }

      const res = await fetchWithTimeout("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, verificationToken })
      });

      const data = await res.json();
      devLog("api response", data);

      if (!res.ok || !data.ok) {
        setError(true);
        setMessage(data.message ?? "Login failed.");
        return;
      }

      devLog("login success response received");
      devLog("session sync start");

      const supabase = createClient();
      if (supabase && data.session?.access_token && data.session?.refresh_token) {
        const syncPromise = supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token
        });

        const timeoutPromise = new Promise<{ error: Error }>((resolve) =>
          setTimeout(() => resolve({ error: new Error("Session sync timeout") }), SESSION_SYNC_TIMEOUT_MS)
        );

        const { error: sessionError } = await Promise.race([syncPromise, timeoutPromise]);
        if (sessionError) {
          throw sessionError;
        }
      }

      devLog("session sync end", "client session synchronized");

      const redirectTarget = normalizeRedirectTarget(nextPath ?? readLastPath());
      setMessage("Login successful. Redirecting...");
      devLog("redirect start", { target: redirectTarget });
      if (pathname !== redirectTarget) {
        router.replace(redirectTarget);
        router.refresh();
      }
      devLog("redirect end");

      const currentSession = supabase ? await supabase.auth.getSession() : null;
      devLog(
        "auth state updated",
        currentSession?.data?.session ? "session present" : "session not present"
      );
    } catch (err) {
      setError(true);
      setMessage("Login request timed out or failed. Please try again.");
      devLog("flow failed", err);
    } finally {
      setSubmitting(false);
      devLog("loading cleared");
    }
  }

  return (
    <AuthShell
      eyebrow="account"
      heading="Welcome back to sneakerfeature."
      accentWord="sneakerfeature"
      subheading="Sign in to write reviews, save compares, and keep your index synced across devices."
    >
      <motion.form
        onSubmit={onSubmit}
        onPointerMove={tilt.onMove}
        onPointerLeave={tilt.onLeave}
        initial={reduce ? false : "initial"}
        animate="animate"
        variants={stagger}
        className="glass-card tilt-3d mx-auto w-full max-w-md space-y-5 p-5 md:p-8"
      >
        <motion.div variants={fadeUp} className="space-y-1.5">
          <p className="auth-eyebrow">{translate("log in")}</p>
          <h2 className="text-[28px] font-semibold tracking-[-0.02em]">{translate("Sign in")}</h2>
          <p className="text-sm soft-text">{translate("Sign in with email or username.")}</p>
        </motion.div>

        <motion.div variants={fadeUp}>
          <FloatingInput
            label={translate("Email or username")}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            required
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <FloatingInput
            label={translate("Password")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
          <div className="mt-2 flex justify-end">
            <Link
              href="/forgot-password"
              className="text-xs text-[rgb(var(--subtext))] underline-offset-4 transition hover:text-[rgb(var(--text))] hover:underline"
            >
              {translate("Forgot password?")}
            </Link>
          </div>
        </motion.div>

        <motion.div variants={fadeUp}>
          <HumanCheck action="login" onToken={setVerificationToken} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }} transition={{ duration: DUR.fast, ease: EASE }}>
            <Button type="submit" className="shimmer-on-hover group h-11 w-full text-[0.95rem]" disabled={submitting}>
              <span className="relative z-10 inline-flex items-center gap-2">
                {submitting ? translate("Signing in...") : translate("Sign in")}
                {!submitting && (
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5" />
                )}
              </span>
            </Button>
          </motion.div>
        </motion.div>

        <AnimatePresence mode="wait">
          {submitting && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DUR.base, ease: EASE }}
            >
              <SneakerLoader compact label="Authenticating" />
            </motion.div>
          )}
          {message && !submitting && (
            <motion.div
              key={`${error ? "err" : "ok"}-${message}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: DUR.base, ease: EASE }}
            >
              <FeedbackMessage message={message} isError={error} />
            </motion.div>
          )}
        </AnimatePresence>

        <motion.p variants={fadeUp} className="pt-1 text-xs soft-text">
          {translate("Need an account?")}{" "}
          <Link href="/signup" className="text-[rgb(var(--text))] underline-offset-4 hover:underline">
            {translate("Sign up")}
          </Link>
        </motion.p>
      </motion.form>
    </AuthShell>
  );
}
