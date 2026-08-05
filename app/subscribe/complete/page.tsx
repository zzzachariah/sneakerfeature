import Link from "next/link";
import type { Metadata } from "next";
import { Crown, CheckCircle2, Clock, Smartphone } from "lucide-react";
import { fulfillCheckoutSession } from "@/lib/stripe/fulfill";
import { APP_URL_SCHEME } from "@/lib/native/deep-link";

// Tapping a link with the shell's custom scheme is the only reliable way back
// into the app from here: Stripe lands the buyer in an external browser via a
// server redirect, and iOS does not fire universal links for redirect chains —
// only for real taps.
const APP_RETURN_LINK = `${APP_URL_SCHEME}://subscribe`;

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "开通结果 · sneakerfeature",
  robots: { index: false }
};

// Return page after embedded checkout completes. Also acts as a fulfillment
// fallback: it calls fulfillCheckoutSession (idempotent) so the membership is
// granted even if the webhook endpoint isn't configured yet.
export default async function SubscribeCompletePage({
  searchParams
}: {
  searchParams: Promise<{ session_id?: string; app?: string }>;
}) {
  const { session_id, app } = await searchParams;
  // Set by /api/stripe/checkout when the buyer started from the native shell.
  const fromNativeApp = app === "1";

  let ok = false;
  let title = "无法确认支付";
  let detail = "没有找到支付会话。如果你已经扣款，请返回会员页或联系客服。";

  if (session_id) {
    try {
      const result = await fulfillCheckoutSession(session_id);
      if (result.status === "granted" || result.status === "already") {
        ok = true;
        title = "开通成功 🎉";
        detail = "你的会员权益已生效，回到 App 即可享用更强的模型与专属功能。";
      } else if (result.status === "unpaid") {
        title = "支付未完成";
        detail = "这笔支付尚未成功。如果你已扣款，请稍等片刻后刷新，或联系客服。";
      } else {
        title = "开通处理中";
        detail = "支付已收到，正在为你开通，稍等片刻刷新即可。";
      }
    } catch {
      title = "开通处理中";
      detail = "支付已收到，正在为你开通。若长时间未生效，请联系客服。";
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: ok ? "rgb(var(--brand) / 0.14)" : "rgb(var(--text) / 0.06)" }}
      >
        {ok ? (
          <CheckCircle2 className="h-8 w-8" style={{ color: "rgb(var(--brand))" }} />
        ) : (
          <Clock className="h-8 w-8 soft-text" />
        )}
      </div>
      <h1 className="mt-5 text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed soft-text">{detail}</p>
      {fromNativeApp ? (
        // Opened in the system browser from the app. The web links below would
        // be dead ends here — this browser has its own cookie jar and is signed
        // out, so /subscribe would just bounce to the home page. Offer the one
        // action that matters instead: get back into the app.
        <>
          <a
            href={APP_RETURN_LINK}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
            style={{ background: "rgb(var(--brand))", color: "rgb(var(--brand-contrast))" }}
          >
            <Smartphone className="h-4 w-4" /> 返回 App
          </a>
          <p className="mt-4 max-w-[34ch] text-xs leading-relaxed soft-text">
            这个页面在系统浏览器里打开，所以显示为未登录 —— 这不影响开通，权益是记在你账号上的。
            回到 App 后会员状态会自动刷新；也可以直接关掉这个页面。
          </p>
        </>
      ) : (
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/subscribe"
            className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
            style={{ background: "rgb(var(--brand))", color: "rgb(var(--brand-contrast))" }}
          >
            <Crown className="h-4 w-4" /> 返回会员页
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl border border-[rgb(var(--text)/0.15)] px-5 py-3 text-sm font-medium transition hover:bg-[rgb(var(--text)/0.05)]"
          >
            回到首页
          </Link>
        </div>
      )}
    </div>
  );
}
