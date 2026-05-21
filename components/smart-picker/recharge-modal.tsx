"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { AlertTriangle, ArrowLeft, Check, Copy, Loader2, Upload } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";
import { CheckinBadge } from "@/components/smart-picker/checkin-badge";
import { CREDIT_PACKAGES } from "@/lib/ai/packages";
import type { CheckinStatus } from "@/lib/ai/checkin";

type Props = {
  open: boolean;
  onClose: () => void;
  balance: number;
  onBalance: (next: number) => void;
  checkin: CheckinStatus;
  onClaimCheckin: () => Promise<void>;
};

type PaymentMethod = "wechat" | "alipay";

type Step = "package" | "method" | "qr" | "result";

type CreatedOrder = {
  id: string;
  verificationCode: string;
  amountYuan: number;
  credits: number;
  packageLabel: string;
  paymentMethod: PaymentMethod;
  expiresAt: string;
};

type SubmitOutcome =
  | { kind: "auto"; credits: number; balance: number }
  | { kind: "pending"; reason: "amount_mismatch" | "code_mismatch" | "ocr_failed" | "no_match" }
  | { kind: "error"; message: string };

const SUPPORT_WECHAT_ID = "UserName_0000000";

function CopyableWechat() {
  const { translate } = useLocale();
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(SUPPORT_WECHAT_ID);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — silently ignore; the ID is still visible to read.
    }
  }, []);
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1 rounded-md border border-[rgb(var(--text)/0.25)] bg-[rgb(var(--bg))]/60 px-2 py-1 font-mono text-[0.78rem] hover:bg-[rgb(var(--surface))]"
      aria-label={translate("Copy support WeChat ID")}
    >
      <span>{SUPPORT_WECHAT_ID}</span>
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

const QR_SRC: Record<PaymentMethod, string> = {
  wechat: "/wechat-qr.png.jpg",
  alipay: "/alipay-qr.png.jpg"
};

const QR_BRAND_COLOR: Record<PaymentMethod, string> = {
  wechat: "#1aad19",
  alipay: "#1677ff"
};

export function RechargeModal({ open, onClose, balance, onBalance, checkin, onClaimCheckin }: Props) {
  const { translate } = useLocale();
  const [step, setStep] = useState<Step>("package");
  const [packageId, setPackageId] = useState<string | null>(null);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<SubmitOutcome | null>(null);

  // Reset everything when the modal closes so reopening starts fresh.
  useEffect(() => {
    if (!open) {
      setStep("package");
      setPackageId(null);
      setMethod(null);
      setOrder(null);
      setCreateError(null);
      setOutcome(null);
      setCreating(false);
    }
  }, [open]);

  const selectedPackage = useMemo(
    () => CREDIT_PACKAGES.find((p) => p.id === packageId) ?? null,
    [packageId]
  );

  const handlePickPackage = useCallback((id: string) => {
    setPackageId(id);
    setStep("method");
  }, []);

  const handlePickMethod = useCallback(
    async (m: PaymentMethod) => {
      if (!packageId || creating) return;
      setMethod(m);
      setCreating(true);
      setCreateError(null);
      try {
        const res = await fetch("/api/ai/payment/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packageId, paymentMethod: m })
        });
        const json = await res.json();
        if (!json?.ok) {
          setCreateError(json?.message ?? translate("Failed to create payment order."));
          return;
        }
        setOrder(json.order as CreatedOrder);
        setStep("qr");
      } catch {
        setCreateError(translate("Network error. Please retry."));
      } finally {
        setCreating(false);
      }
    },
    [packageId, creating, translate]
  );

  const handleSubmitted = useCallback(
    (o: SubmitOutcome) => {
      setOutcome(o);
      setStep("result");
      if (o.kind === "auto") onBalance(o.balance);
    },
    [onBalance]
  );

  const handleBackToPackages = useCallback(() => {
    setStep("package");
    setPackageId(null);
    setMethod(null);
    setOrder(null);
    setCreateError(null);
    setOutcome(null);
  }, []);

  return (
    <Modal open={open} onClose={onClose} title={translate("Recharge credits")}>
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-[rgb(var(--text)/0.05)] px-4 py-3">
          <span className="text-sm soft-text">{translate("Balance")}</span>
          <span className="inline-flex items-center gap-2 text-base font-semibold">
            {balance} {translate("credits")}
            <CheckinBadge checkin={checkin} onClaim={onClaimCheckin} size="md" />
          </span>
        </div>

        {step === "package" && <StepPackages onPick={handlePickPackage} />}

        {step === "method" && selectedPackage && (
          <StepMethod
            packageLabel={selectedPackage.label}
            amount={selectedPackage.priceYuan}
            credits={selectedPackage.credits}
            creating={creating}
            method={method}
            error={createError}
            onBack={handleBackToPackages}
            onPick={handlePickMethod}
          />
        )}

        {step === "qr" && order && (
          <StepQrAndUpload order={order} onBack={handleBackToPackages} onSubmitted={handleSubmitted} />
        )}

        {step === "result" && outcome && (
          <StepResult outcome={outcome} onDone={onClose} onAgain={handleBackToPackages} />
        )}
      </div>
    </Modal>
  );
}

function StepPackages({ onPick }: { onPick: (id: string) => void }) {
  const { translate } = useLocale();
  return (
    <>
      <p className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--surface)/0.6)] p-3 text-[0.8rem] leading-relaxed soft-text">
        {translate("1 credit = 1 recommended shoe. Asking AI for 10 shoes at once costs 10 credits. Please choose the number before sending.")}
      </p>
      <div className="grid grid-cols-2 gap-3">
        {CREDIT_PACKAGES.map((pkg) => (
          <button
            key={pkg.id}
            type="button"
            onClick={() => onPick(pkg.id)}
            className="liquid-interactive flex flex-col items-center gap-1 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] p-4 transition hover:border-[rgb(var(--text)/0.4)] hover:bg-[rgb(var(--surface))]"
          >
            <span className="text-lg font-bold tracking-[-0.01em]">
              {pkg.credits} {translate("credits")}
            </span>
            <span className="text-sm soft-text">¥{pkg.priceYuan}</span>
            <span className="mt-1 inline-flex h-7 items-center justify-center rounded-full bg-[rgb(var(--text))] px-3 text-[0.72rem] font-semibold text-[rgb(var(--bg))]">
              {translate("Buy")}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function StepMethod({
  packageLabel,
  amount,
  credits,
  creating,
  method,
  error,
  onBack,
  onPick
}: {
  packageLabel: string;
  amount: number;
  credits: number;
  creating: boolean;
  method: PaymentMethod | null;
  error: string | null;
  onBack: () => void;
  onPick: (m: PaymentMethod) => void;
}) {
  const { translate } = useLocale();
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs soft-text hover:text-[rgb(var(--text))]"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {translate("Back to packages")}
      </button>
      <div className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--surface)/0.6)] p-3 text-sm">
        <p className="font-medium">{packageLabel}</p>
        <p className="mt-1 soft-text">
          {credits} {translate("credits")} · ¥{amount}
        </p>
      </div>

      <p className="text-sm soft-text">{translate("Choose a payment method:")}</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={creating}
          onClick={() => onPick("wechat")}
          className="liquid-interactive flex flex-col items-center gap-1.5 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] p-4 transition hover:border-[#1aad19] hover:bg-[rgb(var(--surface))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-2xl">💚</span>
          <span className="text-sm font-semibold">{translate("WeChat Pay")}</span>
          {creating && method === "wechat" && <Loader2 className="h-4 w-4 animate-spin" />}
        </button>
        <button
          type="button"
          disabled={creating}
          onClick={() => onPick("alipay")}
          className="liquid-interactive flex flex-col items-center gap-1.5 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] p-4 transition hover:border-[#1677ff] hover:bg-[rgb(var(--surface))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="text-2xl">💙</span>
          <span className="text-sm font-semibold">{translate("Alipay")}</span>
          {creating && method === "alipay" && <Loader2 className="h-4 w-4 animate-spin" />}
        </button>
      </div>
      {error && (
        <p className="flex items-center gap-1.5 text-sm text-[rgb(var(--danger,239_68_68))]">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </p>
      )}
    </>
  );
}

function StepQrAndUpload({
  order,
  onBack,
  onSubmitted
}: {
  order: CreatedOrder;
  onBack: () => void;
  onSubmitted: (o: SubmitOutcome) => void;
}) {
  const { translate } = useLocale();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 5-minute countdown.
  const [remaining, setRemaining] = useState(() => Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000)));
  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, Math.floor((new Date(order.expiresAt).getTime() - Date.now()) / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [order.expiresAt]);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const expired = remaining <= 0;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(order.verificationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }, [order.verificationCode]);

  const handleFile = useCallback(
    async (file: File) => {
      if (uploading) return;
      setUploading(true);
      setUploadError(null);
      try {
        const form = new FormData();
        form.append("orderId", order.id);
        form.append("screenshot", file);
        const res = await fetch("/api/ai/payment/submit", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok || !json?.ok) {
          onSubmitted({ kind: "error", message: json?.message ?? translate("Upload failed.") });
          return;
        }
        if (json.status === "auto_approved") {
          onSubmitted({ kind: "auto", credits: json.credits, balance: json.balance });
          return;
        }
        onSubmitted({ kind: "pending", reason: json.reason ?? "no_match" });
      } catch {
        setUploadError(translate("Network error. Please retry."));
      } finally {
        setUploading(false);
      }
    },
    [order.id, uploading, onSubmitted, translate]
  );

  const brand = QR_BRAND_COLOR[order.paymentMethod];
  const methodName = order.paymentMethod === "wechat" ? translate("WeChat Pay") : translate("Alipay");

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-xs soft-text hover:text-[rgb(var(--text))]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {translate("Cancel & start over")}
        </button>
        <span
          className={`text-xs font-medium tabular-nums ${expired ? "text-[rgb(var(--danger,239_68_68))]" : "soft-text"}`}
        >
          {expired ? translate("Expired") : `${translate("Expires in")} ${mm}:${ss}`}
        </span>
      </div>

      <div className="rounded-2xl border-2 p-3" style={{ borderColor: `${brand}55` }}>
        <p className="text-center text-sm font-semibold" style={{ color: brand }}>
          {methodName}
        </p>
        <p className="mt-1 text-center text-4xl font-bold tabular-nums tracking-[-0.02em]" style={{ color: brand }}>
          ¥{order.amountYuan.toFixed(2)}
        </p>
        <p className="mb-3 text-center text-xs soft-text">
          {translate("Please pay exactly this amount")} · {order.credits} {translate("credits")}
        </p>
        <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-xl bg-white">
          <Image
            src={QR_SRC[order.paymentMethod]}
            alt={methodName}
            width={400}
            height={520}
            className="h-auto w-full"
            unoptimized
          />
        </div>
      </div>

      <div className="rounded-xl border border-amber-500/60 bg-amber-500/10 p-3 text-sm">
        <p className="font-semibold text-amber-700 dark:text-amber-300">
          {translate("Required remark (must fill in!)")}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[rgb(var(--bg))]/60 px-3 py-2">
          <span className="font-mono text-2xl tracking-[0.3em]">{order.verificationCode}</span>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 rounded-full border border-[rgb(var(--text)/0.2)] px-2.5 py-1 text-xs hover:bg-[rgb(var(--surface))]"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? translate("Copied") : translate("Copy")}
          </button>
        </div>
        <p className="mt-2 text-[0.78rem] leading-relaxed text-amber-700 dark:text-amber-300">
          {translate("MUST fill in this code as the payment remark. If you forget, your credits will be refunded.")}
        </p>
      </div>

      <div className="rounded-xl border border-[rgb(var(--danger,239_68_68))/0.4] bg-[rgb(var(--danger,239_68_68))/0.1] p-3 text-[0.78rem] leading-relaxed">
        <p className="font-semibold">{translate("Honest trading reminder")}</p>
        <p className="mt-1 opacity-90">
          {translate("Please trade honestly. Once purchased, no refunds and no exchanges.")}
        </p>
        <p className="mt-2 flex flex-wrap items-center gap-2 opacity-90">
          <span>{translate("For appeals, please add WeChat:")}</span>
          <CopyableWechat />
        </p>
      </div>

      <div className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.6)] p-3 text-sm">
        <p className="font-semibold">{translate("Step 3 — Upload bill-detail screenshot")}</p>
        <div className="mt-2 rounded-lg border border-amber-500/60 bg-amber-500/10 px-3 py-2 text-[0.78rem] font-semibold leading-relaxed text-amber-700 dark:text-amber-300">
          {translate("Principle: the screenshot must contain BOTH the amount and the verification code.")}
        </div>
        <p className="mt-2 text-[0.78rem] leading-relaxed soft-text">
          {translate("After paying, do NOT upload the payment-success screen. Open the bill detail (账单详情) — the page that shows your remark — and upload that screenshot.")}
        </p>
        <details className="mt-2">
          <summary className="cursor-pointer text-[0.78rem] text-[rgb(var(--accent))]">
            {translate("Show example")}
          </summary>
          <div className="mt-2 overflow-hidden rounded-lg bg-white">
            <Image
              src="/wechat-service-example.png.jpg"
              alt={translate("Bill detail screenshot example")}
              width={600}
              height={800}
              className="h-auto w-full"
              unoptimized
            />
          </div>
        </details>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading || expired}
          onClick={() => fileRef.current?.click()}
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[rgb(var(--text))] px-4 py-2 text-sm font-semibold text-[rgb(var(--bg))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {uploading ? translate("Uploading & verifying…") : translate("Upload screenshot")}
        </button>
        {uploadError && (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-[rgb(var(--danger,239_68_68))]">
            <AlertTriangle className="h-4 w-4" />
            {uploadError}
          </p>
        )}
        <p className="mt-2 text-[0.7rem] soft-text">
          {translate("Note: one screenshot per order. Choose carefully.")}
        </p>
      </div>
    </>
  );
}

function StepResult({
  outcome,
  onDone,
  onAgain
}: {
  outcome: SubmitOutcome;
  onDone: () => void;
  onAgain: () => void;
}) {
  const { translate } = useLocale();

  if (outcome.kind === "auto") {
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--success,16_185_129))/0.15]">
          <Check className="h-6 w-6 text-[rgb(var(--success,16_185_129))]" />
        </div>
        <div>
          <p className="text-base font-semibold">{translate("Payment verified — credits added!")}</p>
          <p className="mt-1 text-sm soft-text">
            +{outcome.credits} {translate("credits")} · {translate("New balance")}: {outcome.balance}
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center justify-center rounded-full bg-[rgb(var(--text))] px-5 py-2 text-sm font-semibold text-[rgb(var(--bg))]"
        >
          {translate("Start picking")}
        </button>
      </div>
    );
  }

  if (outcome.kind === "pending") {
    const reasonText: Record<typeof outcome.reason, string> = {
      amount_mismatch: translate("Amount could not be read. We will review it manually."),
      code_mismatch: translate("Verification code could not be read. We will review it manually."),
      ocr_failed: translate("OCR service was unavailable. We will review it manually."),
      no_match: translate("We could not auto-verify your screenshot. We will review it manually.")
    };
    return (
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/15">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
        </div>
        <div>
          <p className="text-base font-semibold">{translate("Submitted — awaiting manual review")}</p>
          <p className="mt-1 text-sm soft-text">{reasonText[outcome.reason]}</p>
          <p className="mt-3 text-[0.78rem] leading-relaxed soft-text">
            {translate("If you forgot the remark, please contact support directly to avoid your payment being refunded.")}
          </p>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-2 text-[0.78rem]">
            <span>{translate("For appeals, please add WeChat:")}</span>
            <CopyableWechat />
          </p>
        </div>
        <button
          type="button"
          onClick={onDone}
          className="inline-flex items-center justify-center rounded-full bg-[rgb(var(--text))] px-5 py-2 text-sm font-semibold text-[rgb(var(--bg))]"
        >
          {translate("Got it")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[rgb(var(--danger,239_68_68))/0.15]">
        <AlertTriangle className="h-6 w-6 text-[rgb(var(--danger,239_68_68))]" />
      </div>
      <div>
        <p className="text-base font-semibold">{translate("Submission failed")}</p>
        <p className="mt-1 text-sm soft-text">{outcome.message}</p>
      </div>
      <button
        type="button"
        onClick={onAgain}
        className="inline-flex items-center justify-center rounded-full bg-[rgb(var(--text))] px-5 py-2 text-sm font-semibold text-[rgb(var(--bg))]"
      >
        {translate("Try again")}
      </button>
    </div>
  );
}
