"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { CodeInput, type CodeInputHandle, type CodeInputStatus, type CodeInputVariant } from "@/components/auth/code-input";
import { DUR, EASE, SPRING, SPRING_POP } from "@/lib/motion/constants";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";

type Props = {
  email: string;
  /** Where the emailed one-tap link should land after verifying. */
  next?: string;
  onVerified: () => void | Promise<void>;
  onBack?: () => void;
  /** Visual family of the surrounding form; see CodeInputVariant. */
  variant?: CodeInputVariant;
};

const RESEND_COOLDOWN_S = 60;
/** Must match Supabase Auth → Email OTP length. */
export const VERIFICATION_CODE_LENGTH = 8;

// Second step of signup (and of signing in to an unverified account): enter the
// emailed code, or tap the link in the same email. Verifying signs the person in.
export function EmailVerifyStep({ email, next, onVerified, onBack, variant = "mono" }: Props) {
  const { locale } = useLocale();
  const t = (zh: string, en: string) => (locale === "zh" ? zh : en);
  const reduce = useReducedMotion();
  const codeRef = useRef<CodeInputHandle>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<CodeInputStatus>("idle");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    const id = requestAnimationFrame(() => codeRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  function handleChange(nextValue: string) {
    setCode(nextValue);
    // Typing again after a rejected code resets the error (the automatic clear doesn't).
    if (status === "error" && nextValue.length > 0) {
      setStatus("idle");
      setMessage("");
    }
  }

  async function verify(value = code) {
    if (busy || status === "success") return;
    if (value.length !== VERIFICATION_CODE_LENGTH) {
      setIsError(true);
      setStatus("error");
      setMessage(t(`请输入完整的 ${VERIFICATION_CODE_LENGTH} 位验证码。`, `Enter all ${VERIFICATION_CODE_LENGTH} digits.`));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: value })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setIsError(true);
        setStatus("error");
        setMessage(
          res.status === 429
            ? t("尝试次数过多，请稍后再试。", "Too many attempts. Wait a few minutes and try again.")
            : t("验证码不正确或已过期。", "That code is incorrect or has expired.")
        );
        // Let the shake play, then clear for a fresh attempt.
        setTimeout(() => codeRef.current?.clear(), reduce ? 0 : 520);
        return;
      }
      // Cookies are already set by the server; mirror the session into the
      // browser client so client-side listeners update immediately.
      const client = createClient();
      if (client && data.session) await client.auth.setSession(data.session).catch(() => undefined);
      setIsError(false);
      setStatus("success");
      setMessage(t("邮箱已验证，正在进入…", "Email verified. Taking you in…"));
      // Give the success ripple a beat before navigating away.
      await new Promise((r) => setTimeout(r, reduce ? 0 : 650));
      await onVerified();
    } catch {
      setIsError(true);
      setStatus("error");
      setMessage(t("网络错误，请重试。", "Network error. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0) return;
    setCooldown(RESEND_COOLDOWN_S);
    const res = await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next })
    }).catch(() => null);
    setIsError(!res?.ok);
    setStatus("idle");
    setMessage(
      res?.ok
        ? t("新的验证码已发送。", "A new code is on its way.")
        : t("暂时无法重新发送，请稍后再试。", "Couldn't resend right now. Try again shortly.")
    );
    if (res?.ok) codeRef.current?.clear();
  }

  const done = status === "success";

  return (
    <motion.form
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
      className="space-y-5"
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.slow, ease: EASE }}
    >
      <div className="flex items-start gap-3">
        <motion.span
          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{
            // Brand tint only in the brand-accented onboarding flow; the standalone
            // auth pages stay monochrome like the rest of their form.
            background: done
              ? "rgb(var(--success) / 0.14)"
              : variant === "brand"
                ? "rgb(var(--brand) / 0.12)"
                : "rgb(var(--text) / 0.06)",
            transition: "background-color var(--dur-base) var(--ease)"
          }}
          initial={reduce ? false : { scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={reduce ? { duration: DUR.base } : SPRING}
        >
          {/* Re-keyed so the icon pops in fresh when it swaps to the check. */}
          <motion.span
            key={done ? "ok" : "mail"}
            className="flex"
            initial={reduce ? false : { scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: DUR.base } : SPRING_POP}
          >
            {done ? (
              <Check className="h-[18px] w-[18px] text-[rgb(var(--success))]" aria-hidden />
            ) : (
              <MailCheck
                className={`h-[18px] w-[18px] ${variant === "brand" ? "text-[rgb(var(--brand))]" : "text-[rgb(var(--text))]"}`}
                aria-hidden
              />
            )}
          </motion.span>
        </motion.span>
        <p className="text-sm soft-text">
          {t(`我们已向 `, `We sent an ${VERIFICATION_CODE_LENGTH}-digit code and a verification link to `)}
          <strong className="text-[rgb(var(--text))] [overflow-wrap:anywhere]">{email}</strong>
          {t(` 发送了 ${VERIFICATION_CODE_LENGTH} 位验证码和验证链接。输入验证码，或直接点击邮件中的链接。`, ". Enter the code, or tap the link in that email.")}
        </p>
      </div>

      <CodeInput
        ref={codeRef}
        length={VERIFICATION_CODE_LENGTH}
        value={code}
        onChange={handleChange}
        onComplete={(full) => void verify(full)}
        status={status}
        variant={variant}
        disabled={busy || done}
        label={t("验证码", "Verification code")}
      />

      <Button
        type="submit"
        variant={variant === "brand" ? "brand" : undefined}
        className={variant === "brand" ? "min-h-[52px] w-full rounded-2xl text-base font-medium" : "h-11 w-full"}
        disabled={busy || done || code.length !== VERIFICATION_CODE_LENGTH}>
        <span className="inline-flex items-center gap-2">
          {busy && !done && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {done ? t("已验证", "Verified") : busy ? t("验证中…", "Verifying…") : t("验证并继续", "Verify and continue")}
        </span>
      </Button>

      <AnimatePresence mode="wait" initial={false}>
        {message && (
          <motion.div
            key={message}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, height: 0 }}
            animate={{ opacity: 1, y: 0, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, height: 0 }}
            transition={{ duration: DUR.base, ease: EASE }}
          >
            <FeedbackMessage message={message} isError={isError} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between text-xs soft-text">
        <button
          type="button"
          onClick={resend}
          disabled={cooldown > 0 || done}
          className="tabular-nums underline-offset-4 transition-opacity hover:underline disabled:opacity-50"
        >
          {cooldown > 0 ? t(`${cooldown} 秒后可重新发送`, `Resend code in ${cooldown}s`) : t("重新发送验证码", "Resend code")}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} disabled={busy || done} className="underline-offset-4 hover:underline disabled:opacity-50">
            {t("更换邮箱", "Use a different email")}
          </button>
        )}
      </div>
    </motion.form>
  );
}
