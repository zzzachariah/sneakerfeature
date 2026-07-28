"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Gift } from "lucide-react";
import { confirmDialog } from "@/components/native/native-menu";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { FeedbackMessage } from "@/components/ui/feedback-message";
import { DURATIONS, TIERS, type Duration } from "@/lib/subscription/tiers";

type Plan = {
  scanned: number;
  granted: number;
  extended: number;
  skippedHigherTier: number;
  skippedPermanent: number;
  keptPaid: number;
  expiresAt: string | null;
  permanent: boolean;
  applied: boolean;
  sample: { username: string; action: "grant" | "extend" }[];
};

type GiftTier = "pro" | "max";

// Bulk "gift a membership to every member" control (全站送会员).
//
// Deliberately two-step: Preview runs the same planner server-side with
// apply:false and reports exactly who would be touched, and only then does the
// Gift button unlock. Changing the tier or duration drops the preview, so the
// button can never fire against numbers the admin didn't just read.
export function GiftAllPanel() {
  const router = useRouter();
  const [tier, setTier] = useState<GiftTier>("pro");
  const [duration, setDuration] = useState<Duration>("monthly");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [busy, setBusy] = useState<"preview" | "apply" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const durationLabel = DURATIONS.find((d) => d.id === duration)?.label ?? duration;
  const affected = plan ? plan.granted + plan.extended : 0;

  function reset(next: { tier?: GiftTier; duration?: Duration }) {
    if (next.tier) setTier(next.tier);
    if (next.duration) setDuration(next.duration);
    setPlan(null);
    setMessage("");
    setError("");
  }

  async function run(apply: boolean) {
    setBusy(apply ? "apply" : "preview");
    setError("");
    if (apply) setMessage("");
    try {
      const res = await fetch("/api/admin/users/subscription/gift-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier, duration, apply })
      });
      const json = await res.json();
      if (!json?.ok) {
        setError(json?.message ?? "Bulk gift failed.");
        return;
      }
      setPlan(json as Plan);
      if (apply) {
        setMessage(
          `Done — ${json.granted + json.extended} member(s) now on ${TIERS[tier].name}` +
            (json.permanent ? " (permanent)." : ` until ${new Date(json.expiresAt).toLocaleDateString()}.`)
        );
        router.refresh();
      }
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  async function confirmAndApply() {
    if (!plan) return;
    const ok = await confirmDialog({
      title: `Gift ${TIERS[tier].name} to everyone?`,
      message:
        `${plan.granted} member(s) start a new ${durationLabel} term and ${plan.extended} active ${TIERS[tier].name} member(s) ` +
        `get ${durationLabel} added to their remaining time. This can't be undone in bulk — each membership would have to be ` +
        `cancelled one by one.`,
      okLabel: `Gift to ${affected}`,
      destructive: true
    });
    if (!ok) return;
    await run(true);
  }

  const selectCls = "h-9 min-h-0 text-sm";

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Gift className="h-4 w-4 text-[rgb(var(--accent))]" />
        <h2 className="text-sm font-semibold">Gift a membership to every member</h2>
      </div>
      <p className="mt-1 text-xs soft-text">
        Active higher tiers are never downgraded, and members already on this tier get the time added on top of
        what&apos;s left. Preview first — the gift is applied in one shot and isn&apos;t reversible in bulk.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[160px,160px,auto,auto]">
        <Select
          aria-label="Gift tier"
          className={selectCls}
          value={tier}
          disabled={busy !== null}
          onChange={(e) => reset({ tier: e.target.value as GiftTier })}
        >
          <option value="pro">Pro</option>
          <option value="max">Max</option>
        </Select>
        <Select
          aria-label="Gift duration"
          className={selectCls}
          value={duration}
          disabled={busy !== null}
          onChange={(e) => reset({ duration: e.target.value as Duration })}
        >
          {DURATIONS.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </Select>
        <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => run(false)}>
          {busy === "preview" ? "Previewing…" : "Preview"}
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={busy !== null || !plan || plan.applied || affected === 0}
          onClick={confirmAndApply}
        >
          {busy === "apply" ? "Gifting…" : plan ? `Gift ${TIERS[tier].name} to ${affected}` : "Preview first"}
        </Button>
      </div>

      {plan && (
        <div className="mt-3 rounded-xl border border-[rgb(var(--muted)/0.45)] bg-[rgb(var(--bg-elev)/0.55)] p-3 text-sm">
          <p className="text-xs uppercase tracking-wide soft-text">
            {plan.applied ? "Applied" : "Preview"} · {TIERS[tier].name} · {durationLabel}
          </p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            <li>
              Members scanned: <span className="num-display font-semibold">{plan.scanned}</span>
            </li>
            <li>
              New term: <span className="num-display font-semibold">{plan.granted}</span>
            </li>
            <li>
              Time extended: <span className="num-display font-semibold">{plan.extended}</span>
            </li>
            <li>
              Skipped (higher tier): <span className="num-display font-semibold">{plan.skippedHigherTier}</span>
            </li>
            <li>
              Skipped (already permanent): <span className="num-display font-semibold">{plan.skippedPermanent}</span>
            </li>
            <li>
              Keep paid status: <span className="num-display font-semibold">{plan.keptPaid}</span>
            </li>
            <li>
              {plan.permanent
                ? "Never expires"
                : `Expires ${plan.expiresAt ? new Date(plan.expiresAt).toLocaleDateString() : "—"}`}
            </li>
          </ul>
          {plan.sample.length > 0 && !plan.applied && (
            <p className="mt-2 text-xs soft-text">
              e.g. {plan.sample.map((s) => `@${s.username} (${s.action})`).join(" · ")}
            </p>
          )}
          <p className="mt-2 text-xs soft-text">
            Each member draws {TIERS[tier].capabilities.monthlyAllowance} premium credits per 30-day period while the
            membership is active. Gifted memberships are marked as gifts and can never be refunded — only cancelled.
            Members who bought their current plan keep their paid status (and their refund eligibility).
          </p>
        </div>
      )}

      {message && <div className="mt-3"><FeedbackMessage message={message} /></div>}
      {error && <div className="mt-3"><FeedbackMessage message={error} isError /></div>}
    </Card>
  );
}
