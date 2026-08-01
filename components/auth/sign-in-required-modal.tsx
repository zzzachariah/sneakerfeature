"use client";

// Prompt shown when a signed-out visitor tries to do something that needs an
// account — today: starting a membership checkout. Payment binds the perks to a
// user id, so there is nothing to fulfil without one; letting the click fall
// through to Stripe (or to a bare 401 error line) loses the money's owner.
//
// Both CTAs carry ?next= so the user lands back where they were as soon as they
// finish signing in / signing up.

import Link from "next/link";
import type { Route } from "next";
import { LogIn, ShieldCheck, UserPlus, X } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";

export function SignInRequiredModal({
  open,
  onClose,
  next,
  title,
  description
}: {
  open: boolean;
  onClose: () => void;
  /** Path to return to after auth. Must be an in-app absolute path. */
  next: string;
  title?: string;
  description?: string;
}) {
  const { locale } = useLocale();
  const zh = locale === "zh";
  const t = (z: string, e: string) => (zh ? z : e);

  const q = `?next=${encodeURIComponent(next)}`;

  return (
    <Modal open={open} onClose={onClose} title="" dismissible zIndexClass="z-[120]" maxWidthClass="max-w-md">
      <div className="relative flex flex-col text-center">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("关闭", "Close")}
          className="absolute -right-1 -top-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-[rgb(var(--text)/0.5)] transition hover:bg-[rgb(var(--text)/0.06)] hover:text-[rgb(var(--text))]"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>

        <span
          className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: "rgb(var(--gold-ink) / 0.12)", color: "rgb(var(--gold-ink))" }}
        >
          <ShieldCheck className="h-6 w-6" aria-hidden />
        </span>

        <h2 className="mt-4 text-[1.35rem] font-bold leading-[1.25] tracking-[-0.015em]">
          {title ?? t("请先登录或注册", "Sign in to continue")}
        </h2>
        <p className="mx-auto mt-2 max-w-[34ch] text-[0.92rem] leading-[1.6] text-[rgb(var(--text)/0.72)]">
          {description ??
            t(
              "会员权益需要绑定到你的账号，所以付款前请先登录或注册。完成后会自动回到这个页面继续开通。",
              "Membership is tied to your account, so please sign in or create one before paying. You'll come straight back here to finish."
            )}
        </p>

        <Link
          href={`/login${q}` as Route}
          onClick={onClose}
          className="mt-6 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition active:scale-[0.99]"
          style={{ background: "rgb(var(--text))", color: "rgb(var(--bg-elev))" }}
        >
          <LogIn className="h-4 w-4" aria-hidden />
          {t("去登录", "Sign in")}
        </Link>

        <Link
          href={`/signup${q}` as Route}
          onClick={onClose}
          className="mt-3 inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[rgb(var(--muted)/0.5)] px-5 text-sm font-semibold transition hover:bg-[rgb(var(--text)/0.05)] active:scale-[0.99]"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {t("注册新账号", "Create an account")}
        </Link>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 inline-flex h-9 items-center justify-center rounded-xl text-sm font-medium text-[rgb(var(--text)/0.55)] transition hover:text-[rgb(var(--text))]"
        >
          {t("以后再说", "Maybe later")}
        </button>
      </div>
    </Modal>
  );
}
