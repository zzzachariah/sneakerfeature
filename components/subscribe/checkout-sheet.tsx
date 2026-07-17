"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { loadStripe } from "@stripe/stripe-js";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import type { Duration } from "@/lib/subscription/tiers";

// Publishable key is safe to expose to the client (that's its purpose). Loaded
// once at module scope; null when unset so the sheet can show a clear message
// instead of crashing.
const pk = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
const stripePromise = pk ? loadStripe(pk) : null;

export function CheckoutSheet({
  tier,
  duration,
  title,
  onClose
}: {
  tier: "pro" | "max";
  duration: Duration;
  title: string;
  onClose: () => void;
}) {
  const fetchClientSecret = useCallback(async () => {
    const res = await fetch("/api/stripe/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier, duration })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.clientSecret) {
      throw new Error(data?.message || "创建支付会话失败，请重试。");
    }
    return data.clientSecret as string;
  }, [tier, duration]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button aria-label="关闭" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[rgb(var(--bg-elev))] shadow-cinematic sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[rgb(var(--text)/0.08)] px-5 py-4">
          <div>
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] soft-text">开通会员</p>
            <p className="text-base font-semibold tracking-tight">{title}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="rounded-full p-2 transition hover:bg-[rgb(var(--text)/0.07)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-[320px] overflow-y-auto px-2 py-3">
          {!stripePromise ? (
            <p className="p-6 text-center text-sm soft-text">
              支付尚未配置（缺少 NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY）。
            </p>
          ) : (
            <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          )}
        </div>
      </div>
    </div>
  );
}
