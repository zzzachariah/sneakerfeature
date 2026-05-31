"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { SneakerLoader } from "@/components/ui/sneaker-loader";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { AuthShell } from "@/components/auth/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";

const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];
const stagger = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } }
};
const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease } }
};

// How long to wait for the recovery session (from the URL code) before treating
// the link as invalid/expired.
const READY_TIMEOUT_MS = 8000;

export default function ResetPasswordPage() {
  const { translate } = useLocale();
  const router = useRouter();
  const supabaseRef = useRef<ReturnType<typeof createClient>>(null);
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setStatus("invalid");
      return;
    }

    let settled = false;
    const markReady = () => {
      if (settled) return;
      settled = true;
      setStatus("ready");
    };

    // The browser client (detectSessionInUrl) exchanges the ?code in the URL for a
    // recovery session, firing PASSWORD_RECOVERY / SIGNED_IN when it completes.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) markReady();
    });

    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });

    const timeout = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        setStatus("invalid");
      }
    }, READY_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeout);
      listener.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || done) return;

    setError(false);
    setMessage("");
    setSubmitting(true);

    try {
      if (password.length < 8) {
        setError(true);
        setMessage("New password must be at least 8 characters.");
        return;
      }
      if (password !== confirm) {
        setError(true);
        setMessage("The two password entries do not match.");
        return;
      }

      const supabase = getSupabase();
      if (!supabase) {
        setError(true);
        setMessage("Database is not configured.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(true);
        setMessage(updateError.message);
        return;
      }

      setError(false);
      setDone(true);
      setMessage("Password updated. Redirecting...");
      window.setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 1200);
    } catch {
      setError(true);
      setMessage("Request timed out or failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="account"
      heading="Set a new password"
      accentWord="password"
      subheading="Choose a new password for your account."
    >
      <motion.div
        initial="initial"
        animate="animate"
        variants={stagger}
        className="glass-card mx-auto w-full max-w-md space-y-5 p-5 md:p-8"
      >
        <motion.div variants={fadeUp} className="space-y-1.5">
          <p className="auth-eyebrow">{translate("log in")}</p>
          <h2 className="text-[28px] font-semibold tracking-[-0.02em]">{translate("Set a new password")}</h2>
        </motion.div>

        {status === "checking" && (
          <motion.div variants={fadeUp}>
            <SneakerLoader compact label="Verifying reset link" />
          </motion.div>
        )}

        {status === "invalid" && (
          <motion.div variants={fadeUp} className="space-y-4">
            <FeedbackMessage message="This reset link is invalid or has expired." isError />
            <Link
              href="/forgot-password"
              className="inline-block text-sm text-[rgb(var(--text))] underline-offset-4 hover:underline"
            >
              {translate("Request a new link")}
            </Link>
          </motion.div>
        )}

        {status === "ready" && (
          <form onSubmit={onSubmit} className="space-y-5">
            <motion.div variants={fadeUp} className="relative">
              <FloatingInput
                label={translate("New password")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                disabled={done}
                className="pr-11"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? translate("Hide password") : translate("Show password")}
                className="absolute right-0 top-0 flex h-full items-center px-3 text-[rgb(var(--subtext))] transition hover:text-[rgb(var(--text))]"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </motion.div>

            <motion.div variants={fadeUp}>
              <FloatingInput
                label={translate("Confirm new password")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                disabled={done}
              />
            </motion.div>

            <motion.div variants={fadeUp}>
              <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.18, ease }}>
                <Button
                  type="submit"
                  className="shimmer-on-hover group h-11 w-full text-[0.95rem]"
                  disabled={submitting || done}
                >
                  <span className="relative z-10 inline-flex items-center gap-2">
                    {submitting ? translate("Updating...") : translate("Reset password")}
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
                  transition={{ duration: 0.2, ease }}
                >
                  <SneakerLoader compact label="Updating your password" />
                </motion.div>
              )}
              {message && !submitting && (
                <motion.div
                  key={`${error ? "err" : "ok"}-${message}`}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.24, ease }}
                >
                  <FeedbackMessage message={message} isError={error} />
                </motion.div>
              )}
            </AnimatePresence>
          </form>
        )}
      </motion.div>
    </AuthShell>
  );
}
