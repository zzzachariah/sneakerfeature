"use client";

import Link from "next/link";
import type { Route } from "next";
import { ArrowRight } from "lucide-react";
import { useLocale } from "@/components/i18n/locale-provider";
import { SignInValue } from "@/components/auth/sign-in-value";

// Shown on /smart-picker to signed-out visitors (it's open to all signed-in
// users now). Routes them to log in, or to the free Quick Picker meanwhile.
export function SmartPickerSignedOut() {
  const { translate } = useLocale();
  return (
    <main className="container-shell flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="t-eyebrow mb-2">{translate("Smart Picker")}</p>
      <h1 className="t-display-sm mb-5" style={{ fontSize: "clamp(1.8rem, 4vw, 3rem)" }}>
        {translate("Find your next pair")}
      </h1>
      <div className="surface-card premium-border w-full max-w-sm rounded-2xl p-6 text-left">
        <SignInValue />
        <Link
          href={"/login?next=/smart-picker" as Route}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[rgb(var(--text))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
        >
          {translate("Log in")} <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <Link
        href={"/quick-picker" as Route}
        className="mt-4 text-sm font-medium text-[rgb(var(--brand))] transition hover:opacity-80"
      >
        {translate("Or try the free Quick Picker")} →
      </Link>
    </main>
  );
}
