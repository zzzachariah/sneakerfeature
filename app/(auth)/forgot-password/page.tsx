"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { SneakerLoader } from "@/components/ui/sneaker-loader";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { TurnstileWidget } from "@/components/ui/turnstile";
import { AuthShell } from "@/components/auth/auth-shell";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";

const CLIENT_TIMEOUT_MS = 12000;
const ease: [number, number, number, number] = [0.22, 1, 0.36, 1];
const stagger = {
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } }
};
const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.42, ease } }
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = CLIENT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export default function ForgotPasswordPage() {
  const { translate } = useLocale();
  const [email, setEmail] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || sent) return;

    setError(false);
    setMessage("");
    setSubmitting(true);

    try {
      if (!email.includes("@")) {
        setError(true);
        setMessage("Please enter a valid email address.");
        return;
      }
      if (!turnstileToken) {
        setError(true);
        setMessage("Please complete human verification.");
        return;
      }

      const res = await fetchWithTimeout("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken })
      });
      const data = await res.json().catch(() => ({ ok: false }));

      if (!res.ok || !data.ok) {
        setError(true);
        setMessage(data.message ?? "Could not send reset link. Please try again.");
        return;
      }

      // Turnstile passed. We always show the same generic result (anti-enumeration),
      // so don't block the UI on the (synchronous, ~2.5s) SMTP send: show success now
      // and fire the recovery email in the background. Sending from this browser also
      // keeps the PKCE code-verifier here so the link completes in this browser.
      setError(false);
      setSent(true);
      setMessage("If an account exists for that email, a reset link has been sent.");

      const supabase = createClient();
      if (supabase) {
        void supabase.auth
          .resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` })
          .catch(() => {});
      }
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
      heading="Reset your password"
      accentWord="password"
      subheading="Enter your account email and we'll send you a reset link."
    >
      <motion.form
        onSubmit={onSubmit}
        initial="initial"
        animate="animate"
        variants={stagger}
        className="glass-card mx-auto w-full max-w-md space-y-5 p-5 md:p-8"
      >
        <motion.div variants={fadeUp} className="space-y-1.5">
          <p className="auth-eyebrow">{translate("log in")}</p>
          <h2 className="text-[28px] font-semibold tracking-[-0.02em]">{translate("Reset your password")}</h2>
          <p className="text-sm soft-text">
            {translate("Enter your account email and we'll send you a reset link.")}
          </p>
        </motion.div>

        <motion.div variants={fadeUp}>
          <FloatingInput
            label={translate("Email")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            autoComplete="email"
            required
            disabled={sent}
          />
        </motion.div>

        <motion.div variants={fadeUp}>
          <TurnstileWidget onToken={setTurnstileToken} />
        </motion.div>

        <motion.div variants={fadeUp}>
          <motion.div whileHover={{ y: -1 }} whileTap={{ scale: 0.985 }} transition={{ duration: 0.18, ease }}>
            <Button
              type="submit"
              className="shimmer-on-hover group h-11 w-full text-[0.95rem]"
              disabled={submitting || sent}
            >
              <span className="relative z-10 inline-flex items-center gap-2">
                {submitting ? translate("Sending...") : translate("Send reset link")}
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
              <SneakerLoader compact label="Sending reset link" />
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

        <motion.p variants={fadeUp} className="pt-1 text-xs soft-text">
          <Link href="/login" className="text-[rgb(var(--text))] underline-offset-4 hover:underline">
            {translate("Back to sign in")}
          </Link>
        </motion.p>
      </motion.form>
    </AuthShell>
  );
}
