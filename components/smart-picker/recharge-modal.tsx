"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/i18n/locale-provider";
import { CREDIT_PACKAGES } from "@/lib/ai/packages";

type Props = {
  open: boolean;
  onClose: () => void;
  balance: number;
  onRecharge: (packageId: string) => Promise<boolean>;
};

export function RechargeModal({ open, onClose, balance, onRecharge }: Props) {
  const { translate } = useLocale();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [justAdded, setJustAdded] = useState<number | null>(null);

  async function handleBuy(packageId: string, credits: number) {
    if (busyId) return;
    setBusyId(packageId);
    setJustAdded(null);
    const ok = await onRecharge(packageId);
    setBusyId(null);
    if (ok) setJustAdded(credits);
  }

  return (
    <Modal open={open} onClose={onClose} title="Recharge credits">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl bg-[rgb(var(--text)/0.05)] px-4 py-3">
          <span className="text-sm soft-text">{translate("Balance")}</span>
          <span className="text-base font-semibold">
            {balance} {translate("credits")}
          </span>
        </div>

        <p className="rounded-xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--surface)/0.6)] p-3 text-[0.8rem] leading-relaxed soft-text">
          {translate("1 credit = 1 recommended shoe. Asking AI for 10 shoes at once costs 10 credits. Please choose the number before sending.")}
        </p>

        <div className="grid grid-cols-2 gap-3">
          {CREDIT_PACKAGES.map((pkg) => (
            <button
              key={pkg.id}
              type="button"
              disabled={busyId !== null}
              onClick={() => handleBuy(pkg.id, pkg.credits)}
              className="liquid-interactive flex flex-col items-center gap-1 rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.55)] bg-[rgb(var(--surface)/0.7)] p-4 transition hover:border-[rgb(var(--text)/0.4)] hover:bg-[rgb(var(--surface))] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="text-lg font-bold tracking-[-0.01em]">
                {pkg.credits} {translate("credits")}
              </span>
              <span className="text-sm soft-text">¥{pkg.priceYuan}</span>
              <span className="mt-1 inline-flex h-7 items-center justify-center rounded-full bg-[rgb(var(--text))] px-3 text-[0.72rem] font-semibold text-[rgb(var(--bg))]">
                {busyId === pkg.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : translate("Complete payment (trial)")}
              </span>
            </button>
          ))}
        </div>

        {justAdded != null && (
          <p className="flex items-center justify-center gap-1.5 text-sm font-medium text-[rgb(var(--success))]">
            <Check className="h-4 w-4" />
            {translate("Added")} {justAdded} {translate("credits")}
          </p>
        )}

        <p className="text-center text-[0.72rem] soft-text">
          {translate("Payment integration is in progress; this is a trial — credits are granted instantly.")}
        </p>
      </div>
    </Modal>
  );
}
