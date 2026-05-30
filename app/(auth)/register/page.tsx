"use client";

import { useState } from "react";
import Link from "next/link";
import { SneakerLoader } from "@/components/ui/sneaker-loader";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TurnstileWidget } from "@/components/ui/turnstile";
import { RequiredReadingGate } from "@/components/auth/required-reading-gate";
import { useLocale } from "@/components/i18n/locale-provider";

export default function RegisterPage() {
  const { translate } = useLocale();
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gateOpen, setGateOpen] = useState(true);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setSubmitting(true);
    if (form.password.length < 8) {
      setSubmitting(false);
      setError(true);
      return setMessage("Password must be at least 8 characters.");
    }
    if (!turnstileToken) {
      setSubmitting(false);
      setError(true);
      return setMessage("Please complete human verification.");
    }

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, turnstileToken })
    });
    const data = await res.json();
    setSubmitting(false);
    setError(!res.ok || !data.ok);
    setMessage(data.message ?? (data.ok ? "Account created." : "Registration failed."));
  }

  return (
    <main className="container-shell py-10">
      {gateOpen && <RequiredReadingGate onContinue={() => setGateOpen(false)} />}
      <form onSubmit={onSubmit} className={`surface-card premium-border mx-auto max-w-md space-y-4 rounded-3xl p-7 ${gateOpen ? "pointer-events-none select-none" : ""}`}>
        <h1 className="text-2xl font-semibold tracking-[0.02em]">{translate("Register")}</h1>
        <p className="text-sm soft-text">{translate("Create your sneakerfeature account. Public identity is username-based.")}</p>
        <div><label className="mb-1 block text-xs soft-text">{translate("Username")}</label><Input value={form.username} onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))} placeholder={translate("sneakerfan23")} required /></div>
        <div><label className="mb-1 block text-xs soft-text">{translate("Email")}</label><Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder={translate("you@domain.com")} type="email" required /></div>
        <div><label className="mb-1 block text-xs soft-text">{translate("Password")}</label><Input value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder={translate("At least 8 characters")} type="password" required /></div>
        <TurnstileWidget onToken={setTurnstileToken} />
        <Button type="submit" className="w-full" disabled={submitting}>{submitting ? translate("Creating account...") : translate("Create account")}</Button>
        {submitting && <SneakerLoader compact label="Setting up your profile" />}
        {message && <FeedbackMessage message={message} isError={error} />}
        <p className="text-xs soft-text">{translate("Already have an account?")} <Link href="/login" className="text-[rgb(var(--accent))] hover:underline">{translate("Log in")}</Link></p>
      </form>
    </main>
  );
}
