"use client";

import { useEffect, useState } from "react";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FloatingInput } from "@/components/ui/floating-input";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { createClient } from "@/lib/supabase/client";
import { useLocale } from "@/components/i18n/locale-provider";

type Props = {
  email: string;
  /** Where the emailed one-tap link should land after verifying. */
  next?: string;
  onVerified: () => void | Promise<void>;
  onBack?: () => void;
};

const RESEND_COOLDOWN_S = 60;

// Second step of signup (and of signing in to an unverified account): enter the
// emailed code, or tap the link in the same email. Verifying signs the person in.
export function EmailVerifyStep({ email, next, onVerified, onBack }: Props) {
  const { locale } = useLocale();
  const t = (zh: string, en: string) => (locale === "zh" ? zh : en);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const trimmed = code.replace(/\s+/g, "");
    if (!/^\d{6,10}$/.test(trimmed)) {
      setIsError(true);
      setMessage(t("请输入邮件中的验证码。", "Enter the code from the email."));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: trimmed })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setIsError(true);
        setMessage(
          res.status === 429
            ? t("尝试次数过多，请稍后再试。", "Too many attempts. Wait a few minutes and try again.")
            : t("验证码不正确或已过期。", "That code is incorrect or has expired.")
        );
        return;
      }
      // Cookies are already set by the server; mirror the session into the
      // browser client so client-side listeners update immediately.
      const client = createClient();
      if (client && data.session) await client.auth.setSession(data.session).catch(() => undefined);
      setIsError(false);
      setMessage(t("邮箱已验证。", "Email verified."));
      await onVerified();
    } catch {
      setIsError(true);
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
    setMessage(
      res?.ok
        ? t("新的验证码已发送。", "A new code is on its way.")
        : t("暂时无法重新发送，请稍后再试。", "Couldn't resend right now. Try again shortly.")
    );
  }

  return (
    <form onSubmit={verify} className="space-y-4" aria-live="polite">
      <div className="flex items-start gap-3">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p className="text-sm soft-text">
          {t("我们已向 ", "We sent a code and a verification link to ")}
          <strong className="text-[rgb(var(--text))] break-all">{email}</strong>
          {t(" 发送了验证码和验证链接。输入验证码，或直接点击邮件中的链接。", ". Enter the code, or tap the link in that email.")}
        </p>
      </div>
      <FloatingInput
        label={t("验证码", "Verification code")}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={12}
        required
      />
      <Button type="submit" className="h-11 w-full" disabled={busy}>
        {busy ? t("验证中…", "Verifying…") : t("验证并继续", "Verify and continue")}
      </Button>
      {message && <FeedbackMessage message={message} isError={isError} />}
      <div className="flex items-center justify-between text-xs soft-text">
        <button type="button" onClick={resend} disabled={cooldown > 0} className="underline-offset-4 hover:underline disabled:opacity-50">
          {cooldown > 0 ? t(`${cooldown} 秒后可重新发送`, `Resend code in ${cooldown}s`) : t("重新发送验证码", "Resend code")}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} className="underline-offset-4 hover:underline">
            {t("更换邮箱", "Use a different email")}
          </button>
        )}
      </div>
    </form>
  );
}
