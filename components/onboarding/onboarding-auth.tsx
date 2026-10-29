"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowRight, Check, Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { z } from "zod";
import { useLocale } from "@/components/i18n/locale-provider";
import { HumanCheck, type HumanCheckHandle } from "@/components/ui/human-check";
import { createClient } from "@/lib/supabase/client";
import { EASE } from "@/lib/motion/constants";
import { authSchema } from "@/lib/validation/schemas";
import { onboardingRequest, onboardingTimeout, OnboardingRequestError } from "./form-utils";
import styles from "./onboarding-forms.module.css";

type Mode = "signup" | "login";
type Fields = "username" | "email" | "identifier" | "password" | "verification" | "agreement";
type AuthResponse = {
  ok: boolean;
  message?: string;
  session?: { access_token: string; refresh_token: string } | null;
  accountCreated?: boolean;
  account_created?: boolean;
};

export type OnboardingAuthProps = {
  onAuthenticated: () => void;
  initialMode?: Mode;
  onModeChange?: (mode: Mode) => void;
};

/** New first-visit UI; the existing standalone auth pages retain their design. */
export function OnboardingAuth({ onAuthenticated, initialMode = "signup", onModeChange }: OnboardingAuthProps) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const t = (cn: string, en: string) => zh ? cn : en;
  const reduce = useReducedMotion();
  const id = useId();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [token, setToken] = useState("");
  const [errors, setErrors] = useState<Partial<Record<Fields, string>>>({});
  const [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const humanCheck = useRef<HumanCheckHandle>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

  function selectMode(next: Mode) {
    if (busyRef.current || next === mode) return;
    setMode(next);
    onModeChange?.(next);
    if (next === "login" && !identifier) setIdentifier(email || username);
    setErrors({});
    setMessage("");
    setRecovery(false);
    setToken("");
    humanCheck.current?.reset();
  }

  function fieldError(field: Fields, value: string) {
    setErrors((current) => ({ ...current, [field]: value }));
  }

  function recoverLogin(reason: string) {
    setRecovery(true);
    setMode("login");
    onModeChange?.("login");
    setIdentifier(email);
    setToken("");
    humanCheck.current?.reset();
    setMessage(reason);
  }

  function validate(): boolean {
    const next: Partial<Record<Fields, string>> = {};
    if (mode === "signup") {
      if (username.trim().length < 3) next.username = t("用户名至少需要 3 个字符。", "Use at least 3 characters.");
      if (!z.string().email().safeParse(email.trim()).success) next.email = t("请填写有效的邮箱地址。", "Enter a valid email address.");
      if (!agreed) next.agreement = t("请阅读并同意服务条款和隐私政策。", "Read and agree to the terms and privacy policy.");
    } else if (identifier.trim().length < 3) {
      next.identifier = t("请输入你的邮箱或用户名。", "Enter your email or username.");
    }
    if (password.length < 8) next.password = t("密码至少需要 8 个字符。", "Your password needs at least 8 characters.");
    if (!token || token === "demo-token") next.verification = t("请完成下方的人机验证。", "Complete the verification below.");
    setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLInputElement>("[aria-invalid='true']")?.focus());
      return false;
    }
    return true;
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current || !configured || !validate()) return;
    busyRef.current = true;
    setBusy(true);
    setMessage("");
    setRecovery(false);
    let didCreate = false;
    try {
      const client = createClient();
      if (!client) throw new Error("Authentication is unavailable.");

      if (mode === "signup") {
        const registration = await onboardingRequest<AuthResponse>("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: username.trim(), email: email.trim(), password, verificationToken: token })
        });
        if (/demo mode/i.test(registration.message || "")) throw new Error("Authentication is unavailable.");
        didCreate = true;
        const result = await onboardingTimeout(client.auth.signInWithPassword({ email: email.trim(), password }));
        if (result.error || !result.data.session) {
          recoverLogin(t("账号已创建。请完成验证并登录，继续建立你的档案。", "Your account is created. Verify and sign in to continue your setup."));
          return;
        }
      } else {
        const parsed = authSchema.safeParse({ identifier: identifier.trim(), password, verificationToken: token });
        if (!parsed.success) throw new Error(parsed.error.issues[0]?.message || "Invalid sign-in details.");
        const result = await onboardingRequest<AuthResponse>("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data)
        });
        if (!result.session?.access_token || !result.session.refresh_token) {
          throw new Error("No authenticated session was returned.");
        }
        const session = await onboardingTimeout(client.auth.setSession(result.session));
        if (session.error || !session.data.session) throw session.error || new Error("Session could not be established.");
      }

      // A successful API message or a cached session alone is not success.
      const verified = await onboardingTimeout(client.auth.getUser());
      if (verified.error || !verified.data.user) throw verified.error || new Error("Could not verify your account.");
      setPassword("");
      setMessage(t("已登录，正在准备你的专属空间。", "You’re signed in. Preparing your space."));
      await onAuthenticated();
    } catch (error) {
      humanCheck.current?.reset();
      setToken("");
      const raw = error instanceof Error ? error.message : "";
      const knownCreated = error instanceof OnboardingRequestError && Boolean(error.payload.accountCreated || error.payload.account_created);
      if (mode === "signup" && (didCreate || knownCreated || /account created.*profile/i.test(raw))) {
        recoverLogin(t("账号已创建，但设置尚未完成。请登录以继续，无需再次注册。", "Your account was created, but setup is unfinished. Sign in to continue; you don’t need to register again."));
      } else if (/username.*taken/i.test(raw)) {
        fieldError("username", t("这个用户名已被使用，请换一个。", "This username is taken. Try another."));
      } else if (/already.*registered|already.*exists|already.*email/i.test(raw)) {
        setMessage(t("这个邮箱已有账号。切换到登录即可继续。", "An account already uses this email. Switch to sign in to continue."));
      } else if (/incorrect password|invalid login|invalid.*credentials/i.test(raw)) {
        fieldError("password", t("登录信息不匹配，请检查后重试。", "Those details don’t match. Check and try again."));
      } else if (/verification|turnstile|human/i.test(raw)) {
        fieldError("verification", t("验证已失效，请重新完成验证后重试。", "Verification expired. Complete a fresh check and retry."));
      } else {
        setMessage(t("暂时无法完成请求。输入已保留，请检查网络后重试。若刚才已注册成功，可切换登录继续。", "We couldn’t finish that request. Your entries are kept; check your connection and retry. If your account was just created, switch to sign in."));
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function field(name: Exclude<Fields, "verification" | "agreement">, label: string, value: string, setValue: (value: string) => void, type = "text", autoComplete?: string) {
    const error = errors[name];
    const isPassword = name === "password";
    const inputId = `${id}-${name}`;
    return <div className={styles.fieldWrap}>
      <div className={styles.field}>
        <input id={inputId} name={name} value={value} onChange={(event) => { setValue(event.target.value); if (error) fieldError(name, ""); }}
          type={isPassword ? (showPassword ? "text" : "password") : type} autoComplete={autoComplete}
          autoCapitalize="none" spellCheck={false} placeholder=" " disabled={busy} required
          aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined}
          className={`${styles.input} ${isPassword ? styles.passwordInput : ""}`} />
        <label htmlFor={inputId} className={styles.label}>{label}</label>
        {isPassword && <button className={styles.fieldAction} type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? t("隐藏密码", "Hide password") : t("显示密码", "Show password")} aria-pressed={showPassword}>
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>}
      </div>
      {error && <p id={`${inputId}-error`} className={styles.fieldError}>{error}</p>}
    </div>;
  }

  return <section className={styles.formRoot} lang={locale} aria-labelledby={`${id}-title`} data-onboarding-auth>
    <div className={styles.heading}>
      <p className={styles.eyebrow}>{t("你的球鞋之旅，从这里开始", "Your game. Your next pair.")}</p>
      <h2 id={`${id}-title`} className={styles.title}>{mode === "signup" ? t("让每一次选鞋，\n更懂你。", "Make your next pair personal.") : t("回到你的球场。", "Back to your game.")}</h2>
      <p className={styles.description}>{mode === "signup" ? t("创建账号，保存你的球员档案与选鞋偏好。", "Create an account to keep your player profile and shoe preferences together.") : t("登录后，从你熟悉的地方继续。", "Sign in and pick up where you left off.")}</p>
    </div>
    <div className={styles.tabs} role="group" aria-label={t("账号操作", "Account options")}>
      {(["signup", "login"] as const).map((item) => <button key={item} type="button" className={styles.tab} data-selected={mode === item} aria-pressed={mode === item} onClick={() => selectMode(item)} disabled={busy}>
        {mode === item && <motion.span className={styles.tabFill} layoutId={`${id}-auth-tab`} transition={{ duration: reduce ? .14 : .3, ease: EASE }} />}
        <span className={styles.tabLabel}>{item === "signup" ? t("创建账号", "Create account") : t("已有账号", "Sign in")}</span>
      </button>)}
    </div>
    <form ref={formRef} className={styles.form} onSubmit={submit} noValidate aria-busy={busy}>
      <AnimatePresence initial={false} mode="popLayout">
        {mode === "signup" ? <motion.div key="signup-fields" className={styles.form} initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduce ? 0 : -5 }} transition={{ duration: reduce ? .14 : .28, ease: EASE }}>
          {field("username", t("用户名", "Username"), username, setUsername, "text", "username")}
          {field("email", t("邮箱", "Email"), email, setEmail, "email", "email")}
        </motion.div> : <motion.div key="login-fields" initial={{ opacity: 0, y: reduce ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? .14 : .28, ease: EASE }}>
          {field("identifier", t("邮箱或用户名", "Email or username"), identifier, setIdentifier, "text", "username")}
        </motion.div>}
      </AnimatePresence>
      {field("password", t("密码", "Password"), password, setPassword, "password", mode === "signup" ? "new-password" : "current-password")}
      {mode === "login" && <Link href="/forgot-password" target="_blank" rel="noopener noreferrer" className={styles.forgot}>{t("忘记密码？", "Forgot password?")}</Link>}
      {mode === "signup" && <div>
        <label className={styles.consent}>
          <input type="checkbox" checked={agreed} onChange={(event) => { setAgreed(event.target.checked); fieldError("agreement", ""); }} disabled={busy} aria-invalid={Boolean(errors.agreement)} aria-describedby={errors.agreement ? `${id}-agreement-error` : undefined} />
          <span>{t("我已阅读并同意", "I agree to the")} <Link href="/terms" target="_blank" rel="noopener noreferrer" className={styles.link}>{t("服务条款", "Terms of Use")}</Link> {t("和", "and")} <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={styles.link}>{t("隐私政策", "Privacy Policy")}</Link>{zh ? "。" : "."}</span>
        </label>
        {errors.agreement && <p id={`${id}-agreement-error`} className={styles.fieldError}>{errors.agreement}</p>}
      </div>}
      <div className={styles.verification}>
        {configured ? <HumanCheck key={mode} ref={humanCheck} action={mode === "signup" ? "register" : "login"} onToken={setToken} /> : <div className={styles.feedback} role="status"><AlertCircle size={16} /><span>{t("账号服务暂不可用，请稍后重试。", "Account setup is temporarily unavailable. Please try again later.")}</span></div>}
        {errors.verification && <p className={styles.fieldError} role="alert">{errors.verification}</p>}
      </div>
      <AnimatePresence initial={false}>
        {message && <motion.div key={message} className={`${styles.feedback} ${recovery ? styles.notice : ""}`} role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: reduce ? .14 : .22, ease: EASE }}>
          {recovery ? <Check size={16} /> : <AlertCircle size={16} />}<span>{message}</span>
        </motion.div>}
      </AnimatePresence>
      <motion.button type="submit" className={styles.primary} disabled={busy || !configured} whileTap={reduce ? undefined : { scale: .985 }} transition={{ duration: .12 }}>
        {busy ? <Loader2 size={18} className={styles.spinner} /> : null}
        {busy ? t(mode === "signup" ? "正在创建账号…" : "正在登录…", mode === "signup" ? "Creating your account…" : "Signing in…") : mode === "signup" ? t("创建账号，继续", "Create account & continue") : t("登录，继续", "Sign in & continue")}
        {!busy && <ArrowRight size={18} />}
      </motion.button>
    </form>
    <p className={styles.footerNote}><LockKeyhole size={12} />{t("表单不会将密码保存在设备上。", "This form never stores your password on this device.")}</p>
  </section>;
}
