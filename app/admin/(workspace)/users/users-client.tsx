"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, Shield, ShieldOff, ShieldCheck, Crown, Gift, RotateCcw, XCircle } from "lucide-react";
import { confirmDialog } from "@/components/native/native-menu";
import { Card } from "@/components/ui/card";
import { TIERS, DURATIONS, type Tier, type Duration } from "@/lib/subscription/tiers";
import type { SubscriptionSource } from "@/lib/subscription/resolve";

export type UserRow = {
  id: string;
  username: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  comments: number;
  ratings: number;
  favorites: number;
  submissions: number;
  lastActiveAt: string | null;
  /** EFFECTIVE tier (expiry-resolved) — a lapsed plan reads as "free". */
  tier: Tier;
  /** True when a paid tier is stored but its term has already ended. */
  expired: boolean;
  expiresAt: string | null;
  isPermanent: boolean;
  /** How the active membership was obtained; only "paid" can be refunded. */
  source: SubscriptionSource | null;
};

function relativeFromNow(iso: string | null): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "never";
  const diff = Date.now() - t;
  const day = 86_400_000;
  const days = Math.floor(diff / day);
  if (days < 1) {
    const hours = Math.floor(diff / 3_600_000);
    if (hours < 1) return "just now";
    return `${hours}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function membershipSummary(row: UserRow): string {
  if (row.tier === "free") {
    return row.expired && row.expiresAt
      ? `free · expired ${new Date(row.expiresAt).toLocaleDateString()}`
      : "free";
  }
  const origin = row.source === "gift" ? " · gifted" : row.source === "paid" ? " · paid" : "";
  if (row.isPermanent) return `${TIERS[row.tier].name} · permanent${origin}`;
  if (row.expiresAt) {
    return `${TIERS[row.tier].name} · until ${new Date(row.expiresAt).toLocaleDateString()}${origin}`;
  }
  return `${TIERS[row.tier].name}${origin}`;
}

// "赠送" marker. A gifted membership is never refundable, so it has to be
// visible at a glance next to the tier — not only in the summary text.
function GiftBadge() {
  return (
    <span
      title="Gifted membership — not refundable"
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
      style={{ color: "#12b886", backgroundColor: "#12b88622", border: "1px solid #12b88666" }}
    >
      <Gift className="h-2.5 w-2.5" aria-hidden />
      gift
    </span>
  );
}

function TierBadge({ tier }: { tier: Tier }) {
  if (tier === "free") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-[rgb(var(--muted)/0.45)] px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wide">
        free
      </span>
    );
  }
  const cfg = TIERS[tier];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide"
      style={{ color: cfg.badgeHue, backgroundColor: `${cfg.badgeHue}22`, border: `1px solid ${cfg.badgeHue}66` }}
    >
      <span aria-hidden>{cfg.badgeGlyph}</span>
      {cfg.name}
    </span>
  );
}

// Inline membership editor: shows the current tier + a tier/duration picker and
// an Apply button. Used in both the mobile card and desktop table layouts.
function MembershipEditor({
  row,
  busy,
  onApply,
  onRefund,
  onCancel
}: {
  row: UserRow;
  busy: boolean;
  onApply: (tier: Tier, duration: Duration) => void;
  onRefund: () => void;
  onCancel: () => void;
}) {
  const [tier, setTier] = useState<Tier>(row.tier);
  const [duration, setDuration] = useState<Duration>("monthly");
  const dirty = tier !== row.tier || (tier !== "free" && !row.isPermanent);
  const selectCls =
    "rounded-lg border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev))] px-2 py-1 text-xs";
  const gifted = row.tier !== "free" && row.source === "gift";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TierBadge tier={row.tier} />
      {gifted && <GiftBadge />}
      <span className="text-[0.7rem] soft-text">{membershipSummary(row)}</span>
      <div className="flex items-center gap-1.5">
        <select
          aria-label="Tier"
          className={selectCls}
          value={tier}
          onChange={(e) => setTier(e.target.value as Tier)}
        >
          <option value="free">Free</option>
          <option value="pro">Pro</option>
          <option value="max">Max</option>
        </select>
        {tier !== "free" && (
          <select
            aria-label="Duration"
            className={selectCls}
            value={duration}
            onChange={(e) => setDuration(e.target.value as Duration)}
          >
            {DURATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => onApply(tier, duration)}
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--accent)/0.6)] px-2.5 py-1 text-xs text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.1)] disabled:opacity-40"
        >
          <Crown className="h-3 w-3" />
          Apply
        </button>
      </div>
      {/* Refund (Stripe refund + revoke) / Cancel (revoke to free, no refund).
          Only meaningful once the member is on an ACTIVE paid tier. A gifted
          membership offers Cancel only — no money changed hands, so there is
          nothing to send back and the API refuses it anyway (code "gifted"). */}
      {row.tier !== "free" && (
        <div className="flex items-center gap-1.5">
          {gifted ? (
            <span className="text-[0.7rem] soft-text" title="Gifted memberships can't be refunded">
              Gift · not refundable
            </span>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onRefund}
              className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--error)/0.6)] px-2.5 py-1 text-xs text-[rgb(var(--error))] transition hover:bg-[rgb(var(--error)/0.1)] disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" />
              Refund
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--muted)/0.6)] px-2.5 py-1 text-xs soft-text transition hover:bg-[rgb(var(--text)/0.05)] disabled:opacity-40"
          >
            <XCircle className="h-3 w-3" />
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export function UsersClient({ initialRows, currentAdminId }: { initialRows: UserRow[]; currentAdminId: string }) {
  const [rows, setRows] = useState<UserRow[]>(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function changeRole(row: UserRow) {
    const next = row.role === "admin" ? "user" : "admin";
    const ok = await confirmDialog({
      message:
        next === "admin"
          ? `Promote @${row.username} to admin? They'll get full console access.`
          : `Remove admin access from @${row.username}?`,
      okLabel: next === "admin" ? "Promote" : "Demote",
      destructive: next === "user"
    });
    if (!ok) return;
    setBusy(row.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, role: next })
      });
      const json = await res.json();
      if (json?.ok) {
        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, role: next } : r)));
        setMessage(`@${row.username} is now ${next}.`);
      } else {
        setMessage(json?.message ?? "Failed to update role.");
      }
    } catch {
      setMessage("Network error. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  async function changeMembership(row: UserRow, tier: Tier, duration: Duration) {
    const label = tier === "free" ? "Free (revoke premium)" : `${TIERS[tier].name} · ${DURATIONS.find((d) => d.id === duration)?.label}`;
    const ok = await confirmDialog({
      message: `Set @${row.username}'s membership to ${label}?`,
      okLabel: "Apply",
      destructive: tier === "free" && row.tier !== "free"
    });
    if (!ok) return;
    setBusy(row.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/users/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, tier, duration })
      });
      const json = await res.json();
      if (json?.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? {
                  ...r,
                  tier: json.tier as Tier,
                  expired: false,
                  expiresAt: json.expiresAt ?? null,
                  isPermanent: Boolean(json.permanent),
                  source: (json.source as UserRow["source"]) ?? null
                }
              : r
          )
        );
        setMessage(`@${row.username} → ${label}.`);
      } else {
        setMessage(json?.message ?? "Failed to update membership.");
      }
    } catch {
      setMessage("Network error. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  // Revoke premium and return the row to free — shared by refund and cancel,
  // which differ only in the endpoint mode (Stripe refund vs. no refund).
  async function revokeMembership(row: UserRow, mode: "refund" | "cancel") {
    const ok = await confirmDialog({
      message:
        mode === "refund"
          ? `Refund @${row.username}'s latest payment and revoke ${TIERS[row.tier].name}? This issues a real Stripe refund and can't be undone.`
          : `Cancel @${row.username}'s ${TIERS[row.tier].name} membership? This revokes access to free with no refund.`,
      okLabel: mode === "refund" ? "Refund" : "Revoke",
      destructive: true
    });
    if (!ok) return;
    setBusy(row.id);
    setMessage("");
    try {
      const res = await fetch("/api/admin/users/subscription/refund", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: row.id, mode })
      });
      const json = await res.json();
      if (json?.ok) {
        setRows((prev) =>
          prev.map((r) =>
            r.id === row.id
              ? { ...r, tier: "free", expired: false, expiresAt: null, isPermanent: false, source: null }
              : r
          )
        );
        setMessage(`@${row.username} ${mode === "refund" ? "refunded" : "cancelled"} → free.`);
      } else {
        setMessage(json?.message ?? (mode === "refund" ? "Refund failed." : "Cancellation failed."));
      }
    } catch {
      setMessage("Network error. Please retry.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-0 overflow-hidden">
      {message && (
        <p className="border-b border-[rgb(var(--muted)/0.35)] px-3 py-2 text-sm text-[rgb(var(--accent))]">{message}</p>
      )}

      {/* Mobile: a stacked card list — every member's data is fully visible
          without horizontal scroll. md+: the original table. */}
      <ol className="divide-y divide-[rgb(var(--muted)/0.35)] md:hidden">
        {rows.map((row) => {
          const isSelf = row.id === currentAdminId;
          return (
            <li key={row.id} className="p-4">
              <Link
                href={`/admin/users/${row.id}` as Route}
                className="flex items-start justify-between gap-3 active:opacity-80"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{row.username}</span>
                    <span
                      className={
                        row.role === "admin"
                          ? "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[rgb(var(--accent)/0.15)] px-1.5 py-0.5 text-[0.6rem] font-medium uppercase tracking-wide text-[rgb(var(--accent))]"
                          : "inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[rgb(var(--muted)/0.45)] px-1.5 py-0.5 text-[0.6rem] uppercase tracking-wide"
                      }
                    >
                      {row.role === "admin" && <ShieldCheck className="h-2.5 w-2.5" />}
                      {row.role}
                    </span>
                    <TierBadge tier={row.tier} />
                    {row.tier !== "free" && row.source === "gift" && <GiftBadge />}
                  </div>
                  <p className="truncate text-xs soft-text">{row.email}</p>
                  <p className="mt-1.5 text-[0.7rem] soft-text">
                    <span className="num-display">{row.comments}</span>c ·{" "}
                    <span className="num-display">{row.ratings}</span>r ·{" "}
                    <span className="num-display">{row.favorites}</span>f ·{" "}
                    <span className="num-display">{row.submissions}</span>s
                  </p>
                  <p className="mt-0.5 text-[0.7rem] soft-text">
                    active {relativeFromNow(row.lastActiveAt)} · joined{" "}
                    {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 soft-text" />
              </Link>
              <div className="mt-3 rounded-lg border border-[rgb(var(--muted)/0.35)] p-2.5">
                <MembershipEditor
                  row={row}
                  busy={busy === row.id}
                  onApply={(tier, duration) => changeMembership(row, tier, duration)}
                  onRefund={() => revokeMembership(row, "refund")}
                  onCancel={() => revokeMembership(row, "cancel")}
                />
              </div>
              {!isSelf && (
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => changeRole(row)}
                  className={
                    row.role === "admin"
                      ? "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--error)/0.6)] px-3 py-2 text-xs text-[rgb(var(--error))] transition active:bg-[rgb(var(--error)/0.1)] disabled:opacity-50"
                      : "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.6)] px-3 py-2 text-xs text-[rgb(var(--accent))] transition active:bg-[rgb(var(--accent)/0.1)] disabled:opacity-50"
                  }
                >
                  {row.role === "admin" ? (
                    <>
                      <ShieldOff className="h-3.5 w-3.5" /> Demote
                    </>
                  ) : (
                    <>
                      <Shield className="h-3.5 w-3.5" /> Make admin
                    </>
                  )}
                </button>
              )}
            </li>
          );
        })}
        {rows.length === 0 && (
          <li className="p-6 text-center text-sm soft-text">No members match.</li>
        )}
      </ol>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="bg-[rgb(var(--bg-elev)/0.85)] text-left text-xs soft-text">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Membership</th>
              <th className="px-3 py-2">Activity</th>
              <th className="px-3 py-2">Last active</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelf = row.id === currentAdminId;
              return (
                <tr
                  key={row.id}
                  className="border-t border-[rgb(var(--muted)/0.35)] align-top transition hover:bg-[rgb(var(--text)/0.04)]"
                >
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/users/${row.id}` as Route}
                      className="group flex items-center gap-1.5"
                    >
                      <span>
                        <span className="block font-medium underline-offset-2 group-hover:underline">
                          {row.username}
                        </span>
                        <span className="block text-xs soft-text">{row.email}</span>
                      </span>
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 soft-text transition group-hover:translate-x-0.5 group-hover:text-[rgb(var(--text))]" />
                    </Link>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={
                        row.role === "admin"
                          ? "inline-flex items-center gap-1 rounded-full bg-[rgb(var(--accent)/0.15)] px-2 py-1 text-xs font-medium text-[rgb(var(--accent))]"
                          : "inline-flex items-center gap-1 rounded-full bg-[rgb(var(--muted)/0.45)] px-2 py-1 text-xs"
                      }
                    >
                      {row.role === "admin" && <ShieldCheck className="h-3 w-3" />}
                      {row.role}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <MembershipEditor
                      row={row}
                      busy={busy === row.id}
                      onApply={(tier, duration) => changeMembership(row, tier, duration)}
                      onRefund={() => revokeMembership(row, "refund")}
                      onCancel={() => revokeMembership(row, "cancel")}
                    />
                  </td>
                  <td className="px-3 py-3 text-xs soft-text whitespace-nowrap">
                    <span className="num-display">{row.comments}</span> comments ·{" "}
                    <span className="num-display">{row.ratings}</span> ratings ·{" "}
                    <span className="num-display">{row.favorites}</span> favs ·{" "}
                    <span className="num-display">{row.submissions}</span> subs
                  </td>
                  <td className="num-display whitespace-nowrap px-3 py-3 text-xs soft-text">
                    {relativeFromNow(row.lastActiveAt)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    {isSelf ? (
                      <span className="text-xs soft-text">you</span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy === row.id}
                        onClick={() => changeRole(row)}
                        className={
                          row.role === "admin"
                            ? "inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--error)/0.6)] px-3 py-1.5 text-xs text-[rgb(var(--error))] transition hover:bg-[rgb(var(--error)/0.1)] disabled:opacity-50"
                            : "inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.6)] px-3 py-1.5 text-xs text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.1)] disabled:opacity-50"
                        }
                      >
                        {row.role === "admin" ? (
                          <>
                            <ShieldOff className="h-3.5 w-3.5" /> Demote
                          </>
                        ) : (
                          <>
                            <Shield className="h-3.5 w-3.5" /> Make admin
                          </>
                        )}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-sm soft-text">
                  No members match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
