"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type OrderStatus = "pending" | "submitted" | "auto_approved" | "manual_approved" | "rejected" | "expired";

type AdminOrder = {
  id: string;
  userId: string;
  username: string | null;
  email: string | null;
  packageId: string;
  packageLabel: string;
  credits: number;
  amountYuan: number;
  verificationCode: string;
  paymentMethod: "wechat" | "alipay";
  status: OrderStatus;
  hasScreenshot: boolean;
  ocrRawText: string | null;
  ocrAmountMatch: boolean | null;
  ocrCodeMatch: boolean | null;
  ocrError: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  expiresAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
};

const STATUS_FILTERS: Array<{ value: OrderStatus | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Awaiting review" },
  { value: "auto_approved", label: "Auto approved" },
  { value: "manual_approved", label: "Manually approved" },
  { value: "rejected", label: "Rejected" },
  { value: "pending", label: "Pending (no upload)" },
  { value: "expired", label: "Expired" }
];

const STATUS_BADGE: Record<OrderStatus, string> = {
  pending: "bg-gray-500/15 text-gray-600 dark:text-gray-300",
  submitted: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  auto_approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  manual_approved: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  rejected: "bg-red-500/15 text-red-700 dark:text-red-300",
  expired: "bg-gray-500/15 text-gray-500"
};

export function PaymentsClient() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("submitted");
  const [selected, setSelected] = useState<AdminOrder | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = statusFilter === "all" ? "/api/admin/payments" : `/api/admin/payments?status=${statusFilter}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!json?.ok) throw new Error(json?.message ?? "Failed to load");
      setOrders(json.orders as AdminOrder[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleAction = useCallback(
    async (orderId: string, action: "approve" | "reject", reason?: string) => {
      setBusy(true);
      try {
        const res = await fetch(`/api/admin/payments/${orderId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action === "approve" ? { action } : { action, reason })
        });
        const json = await res.json();
        if (!json?.ok) {
          alert(json?.message ?? "Action failed");
        } else {
          await load();
          setSelected(null);
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  const counts = useMemo(() => {
    const c: Record<OrderStatus, number> = {
      pending: 0, submitted: 0, auto_approved: 0, manual_approved: 0, rejected: 0, expired: 0
    };
    orders.forEach((o) => { c[o.status] = (c[o.status] ?? 0) + 1; });
    return c;
  }, [orders]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                statusFilter === f.value
                  ? "border-[rgb(var(--accent))] bg-[rgb(var(--accent))/0.15] text-[rgb(var(--accent))]"
                  : "border-[rgb(var(--muted)/0.5)] hover:bg-[rgb(var(--muted)/0.25)]"
              }`}
            >
              {f.label}
            </button>
          ))}
          <button onClick={load} className="ml-auto rounded-full border border-[rgb(var(--muted)/0.5)] px-3 py-1 text-xs hover:bg-[rgb(var(--muted)/0.25)]">
            Refresh
          </button>
        </div>
        <p className="mt-3 text-xs soft-text">
          Submitted: {counts.submitted} · Auto-approved: {counts.auto_approved} · Manually approved: {counts.manual_approved} · Rejected: {counts.rejected}
        </p>
      </Card>

      {error && <Card className="p-4 text-sm text-red-500">Error: {error}</Card>}
      {loading ? (
        <Card className="p-4 text-sm soft-text">Loading…</Card>
      ) : orders.length === 0 ? (
        <Card className="p-4 text-sm soft-text">No orders.</Card>
      ) : (
        <Card className="p-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider soft-text">
                <tr className="border-b border-[rgb(var(--muted)/0.4)]">
                  <th className="px-2 py-2">User</th>
                  <th className="px-2 py-2">Package</th>
                  <th className="px-2 py-2">Amount</th>
                  <th className="px-2 py-2">Code</th>
                  <th className="px-2 py-2">Method</th>
                  <th className="px-2 py-2">OCR</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Created</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-[rgb(var(--muted)/0.25)] hover:bg-[rgb(var(--muted)/0.15)]">
                    <td className="px-2 py-2">
                      <div className="font-medium">{o.username ?? "—"}</div>
                      <div className="text-xs soft-text">{o.email ?? ""}</div>
                    </td>
                    <td className="px-2 py-2">
                      <div>{o.packageLabel}</div>
                      <div className="text-xs soft-text">{o.credits} credits</div>
                    </td>
                    <td className="px-2 py-2 tabular-nums">¥{o.amountYuan}</td>
                    <td className="px-2 py-2 font-mono">{o.verificationCode}</td>
                    <td className="px-2 py-2">{o.paymentMethod}</td>
                    <td className="px-2 py-2 text-xs">
                      {o.hasScreenshot ? (
                        <>
                          <span className={o.ocrAmountMatch ? "text-emerald-600" : "text-red-500"}>amt:{o.ocrAmountMatch === null ? "?" : o.ocrAmountMatch ? "✓" : "✗"}</span>
                          {" · "}
                          <span className={o.ocrCodeMatch ? "text-emerald-600" : "text-red-500"}>code:{o.ocrCodeMatch === null ? "?" : o.ocrCodeMatch ? "✓" : "✗"}</span>
                        </>
                      ) : (
                        <span className="soft-text">no img</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[o.status]}`}>{o.status}</span>
                    </td>
                    <td className="px-2 py-2 text-xs soft-text">{new Date(o.createdAt).toLocaleString()}</td>
                    <td className="px-2 py-2">
                      <Button variant="secondary" onClick={() => setSelected(o)}>Open</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {selected && (
        <OrderModal order={selected} busy={busy} onClose={() => setSelected(null)} onAction={handleAction} />
      )}
    </div>
  );
}

function OrderModal({
  order,
  busy,
  onClose,
  onAction
}: {
  order: AdminOrder;
  busy: boolean;
  onClose: () => void;
  onAction: (orderId: string, action: "approve" | "reject", reason?: string) => Promise<void>;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const canDecide = order.status === "submitted" || order.status === "pending";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="surface-card max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold">Order {order.id.slice(0, 8)}</h3>
            <p className="mt-1 text-sm soft-text">
              {order.username ?? "—"} · {order.packageLabel} · ¥{order.amountYuan} · code <span className="font-mono">{order.verificationCode}</span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-full px-3 py-1 text-sm hover:bg-[rgb(var(--muted)/0.3)]">Close</button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider soft-text">Screenshot</p>
            {order.hasScreenshot ? (
              <a href={`/api/admin/payments/${order.id}/screenshot`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/admin/payments/${order.id}/screenshot`}
                  alt="Payment screenshot"
                  className="mt-2 max-h-[60vh] w-full rounded-lg border border-[rgb(var(--muted)/0.5)] object-contain"
                />
              </a>
            ) : (
              <p className="mt-2 text-sm soft-text">No screenshot uploaded.</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider soft-text">Details</p>
            <dl className="mt-2 space-y-1 text-sm">
              <Detail label="Status">{order.status}</Detail>
              <Detail label="Method">{order.paymentMethod}</Detail>
              <Detail label="Credits">{order.credits}</Detail>
              <Detail label="Amount">¥{order.amountYuan}</Detail>
              <Detail label="Code">{order.verificationCode}</Detail>
              <Detail label="OCR amount match">{order.ocrAmountMatch === null ? "—" : order.ocrAmountMatch ? "✓" : "✗"}</Detail>
              <Detail label="OCR code match">{order.ocrCodeMatch === null ? "—" : order.ocrCodeMatch ? "✓" : "✗"}</Detail>
              {order.ocrError && <Detail label="OCR error">{order.ocrError}</Detail>}
              <Detail label="Created">{new Date(order.createdAt).toLocaleString()}</Detail>
              {order.submittedAt && <Detail label="Submitted">{new Date(order.submittedAt).toLocaleString()}</Detail>}
              {order.approvedAt && <Detail label="Approved">{new Date(order.approvedAt).toLocaleString()}</Detail>}
              {order.rejectionReason && <Detail label="Rejection reason">{order.rejectionReason}</Detail>}
            </dl>

            {order.ocrRawText && (
              <details className="mt-3">
                <summary className="cursor-pointer text-xs text-[rgb(var(--accent))]">OCR raw text</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded bg-[rgb(var(--muted)/0.25)] p-2 text-[0.7rem] leading-tight">{order.ocrRawText}</pre>
              </details>
            )}

            {canDecide && (
              <div className="mt-4 space-y-2">
                <Button onClick={() => onAction(order.id, "approve")} disabled={busy} className="w-full">
                  Approve & grant {order.credits} credits
                </Button>
                <div>
                  <input
                    type="text"
                    placeholder="Rejection reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full rounded-lg border border-[rgb(var(--muted)/0.5)] bg-transparent px-3 py-2 text-sm"
                  />
                  <Button
                    variant="secondary"
                    disabled={busy || !rejectReason.trim()}
                    onClick={() => onAction(order.id, "reject", rejectReason.trim())}
                    className="mt-2 w-full"
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px,1fr] gap-2 text-xs">
      <dt className="soft-text">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}
