"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, Shield, ShieldOff, ShieldCheck, Crown, Gift, RotateCcw, XCircle } from "lucide-react";
import { confirmDialog } from "@/components/native/native-menu";
import { adminPost } from "@/lib/admin/api";
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

// Selection checkbox for the multi-gift flow. A plain input so it stays a real
// checkbox for keyboard and screen readers, wrapped in a padded label: the box
// itself is 16px, and in the mobile card its only neighbour is a Link covering
// the rest of the row, so a near-miss would navigate away and drop the whole
// selection (it lives in component state). `padClass` grows the tap area there.
function SelectBox({
  checked,
  indeterminate,
  disabled,
  label,
  padClass,
  onChange
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  padClass?: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center justify-center ${padClass ?? ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        ref={(el) => {
          if (el) el.indeterminate = Boolean(indeterminate) && !checked;
        }}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-[rgb(var(--accent))] disabled:cursor-not-allowed disabled:opacity-40"
      />
    </label>
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
  // Why Apply is off, spelled out — a disabled button with no explanation is
  // indistinguishable from a broken one.
  const blockedReason = dirty
    ? undefined
    : tier === "free"
      ? "Already on the free tier — nothing to revoke."
      : `Already on ${TIERS[tier].name} permanently — there is no expiry to extend.`;
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
          title={busy ? "Working…" : blockedReason}
          onClick={() => onApply(tier, duration)}
          className="inline-flex items-center gap-1 rounded-lg border border-[rgb(var(--accent)/0.6)] px-2.5 py-1 text-xs text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.1)] disabled:opacity-40"
        >
          <Crown className="h-3 w-3" />
          {busy ? "Working…" : "Apply"}
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

type GiftOutcome = {
  userId: string;
  username: string | null;
  action: "grant" | "extend" | "upgrade" | "skipped-higher-tier" | "skipped-permanent";
  tier: Tier;
  expiresAt: string | null;
  permanent: boolean;
  source: SubscriptionSource | null;
};

type GiftPlan = {
  scanned: number;
  granted: number;
  extended: number;
  upgraded: number;
  skippedHigherTier: number;
  skippedPermanent: number;
  keptPaid: number;
  expiresAt: string | null;
  permanent: boolean;
  applied: boolean;
  results: GiftOutcome[];
  missing: string[];
};

export function UsersClient({ initialRows, currentAdminId }: { initialRows: UserRow[]; currentAdminId: string }) {
  const [rows, setRows] = useState<UserRow[]>(initialRows);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  // --- multi-select gifting (多选用户赠送) ---
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [giftTier, setGiftTier] = useState<"pro" | "max">("pro");
  const [giftDuration, setGiftDuration] = useState<Duration>("monthly");
  const [gifting, setGifting] = useState(false);

  const selectedIds = useMemo(
    () => rows.filter((r) => selected.has(r.id)).map((r) => r.id),
    [rows, selected]
  );
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const anyBusy = busy !== null || gifting;

  function toggleOne(id: string, next: boolean) {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function toggleAll(next: boolean) {
    setSelected(next ? new Set(rows.map((r) => r.id)) : new Set());
  }

  // Fold a gift's per-member outcomes back into the table so the list reflects
  // the new memberships without a reload. Skipped members are left untouched.
  function applyOutcomes(results: GiftOutcome[]) {
    const byId = new Map(results.map((r) => [r.userId, r]));
    setRows((prev) =>
      prev.map((r) => {
        const outcome = byId.get(r.id);
        if (!outcome || outcome.action.startsWith("skipped")) return r;
        return {
          ...r,
          tier: outcome.tier,
          expired: false,
          expiresAt: outcome.expiresAt,
          isPermanent: outcome.permanent,
          source: outcome.source
        };
      })
    );
  }

  // Gift the ticked members in one shot. Preview-first like the全站 panel, but
  // the preview runs automatically: one click → the real numbers in the confirm
  // → apply. No dead "you must preview first" button in between.
  async function giftSelected() {
    if (selectedIds.length === 0 || anyBusy) return;
    const durationLabel = DURATIONS.find((d) => d.id === giftDuration)?.label ?? giftDuration;
    setGifting(true);
    setMessage("");
    setError("");
    try {
      const body = { userIds: selectedIds, tier: giftTier, duration: giftDuration };
      const preview = await adminPost<GiftPlan>("/api/admin/users/subscription/gift", { ...body, apply: false });
      if (!preview.ok) {
        setError(preview.message);
        return;
      }
      const plan = preview.data;
      const affected = plan.granted + plan.extended + plan.upgraded;
      if (affected === 0) {
        // `scanned` counts the profiles the server FOUND, which is not the same
        // as what was ticked when a member was deleted after the page rendered.
        setError(
          plan.scanned === 0
            ? `Nothing to gift — none of the ${selectedIds.length} selected member(s) still exist. Reload the list.`
            : `Nothing to gift — all ${plan.scanned} selected member(s) already hold ${TIERS[giftTier].name} or better ` +
              `(${plan.skippedHigherTier} on a higher tier, ${plan.skippedPermanent} permanent)` +
              (plan.missing.length > 0 ? `; ${plan.missing.length} no longer exist` : "") +
              "."
        );
        return;
      }
      const ok = await confirmDialog({
        title: `Gift ${TIERS[giftTier].name} to ${affected} member(s)?`,
        message:
          `${plan.granted} start a new ${durationLabel} term and ${plan.extended} get ${durationLabel} added to their ` +
          `remaining time.` +
          (plan.upgraded > 0
            ? ` ${plan.upgraded} already run past the gift on a lower tier — they move up to ${TIERS[giftTier].name} and keep their own longer expiry.`
            : "") +
          (plan.skippedHigherTier + plan.skippedPermanent > 0
            ? ` ${plan.skippedHigherTier + plan.skippedPermanent} selected member(s) are skipped (higher tier or already permanent).`
            : "") +
          ` Gifted memberships can't be refunded — only cancelled.`,
        okLabel: `Gift to ${affected}`,
        destructive: true
      });
      if (!ok) return;

      const applied = await adminPost<GiftPlan>("/api/admin/users/subscription/gift", { ...body, apply: true });
      if (!applied.ok) {
        // The write is a sequence of statements, not a transaction, so a failure
        // can leave part of the selection already gifted. Drop the ticks: the
        // obvious "click it again" would stack a second term onto whoever
        // succeeded. The server message says how many landed.
        setSelected(new Set());
        setError(applied.message);
        return;
      }
      applyOutcomes(applied.data.results);
      setSelected(new Set());
      const skipped = applied.data.skippedHigherTier + applied.data.skippedPermanent;
      setMessage(
        `Gifted ${TIERS[giftTier].name} · ${durationLabel} to ${applied.data.granted + applied.data.extended + applied.data.upgraded} member(s)` +
          (skipped > 0 ? ` · ${skipped} skipped` : "") +
          (applied.data.missing.length > 0 ? ` · ${applied.data.missing.length} no longer exist` : "") +
          (applied.data.permanent
            ? " · never expires."
            : applied.data.expiresAt
              ? ` · until ${new Date(applied.data.expiresAt).toLocaleDateString()}.`
              : ".")
      );
    } finally {
      setGifting(false);
    }
  }

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
    setError("");
    try {
      const res = await adminPost<{ ok: true }>("/api/admin/users", { userId: row.id, role: next });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, role: next } : r)));
      setMessage(`@${row.username} is now ${next}.`);
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
    setError("");
    try {
      const res = await adminPost<{
        tier: Tier;
        expiresAt: string | null;
        permanent: boolean;
        source: UserRow["source"];
      }>("/api/admin/users/subscription", { userId: row.id, tier, duration });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      const grant = res.data;
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                tier: grant.tier,
                expired: false,
                expiresAt: grant.expiresAt ?? null,
                isPermanent: Boolean(grant.permanent),
                source: grant.source ?? null
              }
            : r
        )
      );
      setMessage(`@${row.username} → ${label}.`);
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
    setError("");
    try {
      const res = await adminPost<{ ok: true }>("/api/admin/users/subscription/refund", {
        userId: row.id,
        mode
      });
      if (!res.ok) {
        setError(res.message);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? { ...r, tier: "free", expired: false, expiresAt: null, isPermanent: false, source: null }
            : r
        )
      );
      setMessage(`@${row.username} ${mode === "refund" ? "refunded" : "cancelled"} → free.`);
    } finally {
      setBusy(null);
    }
  }

  const selectCls =
    "rounded-lg border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev))] px-2 py-1.5 text-xs";

  return (
    <Card className="p-0 overflow-hidden">
      {message && (
        <p role="status" aria-live="polite" className="border-b border-[rgb(var(--muted)/0.35)] px-3 py-2 text-sm text-[rgb(var(--accent))]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="border-b border-[rgb(var(--muted)/0.35)] px-3 py-2 text-sm text-[rgb(var(--error))]">
          {error}
        </p>
      )}

      {/* Multi-select gift bar (多选用户赠送). Tick any set of members, pick a
          tier + duration, gift them in one request. Same policy as the全站 panel,
          and it only ever adds: an active higher tier or any lifetime membership
          is skipped, an active same tier gets the time stacked on what's left,
          and a lower tier that already outlives the gift moves up while keeping
          its own longer expiry. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[rgb(var(--muted)/0.35)] bg-[rgb(var(--bg-elev)/0.55)] px-3 py-2">
        <label className="flex items-center gap-2 text-xs soft-text">
          <SelectBox
            checked={allSelected}
            indeterminate={selectedIds.length > 0}
            disabled={rows.length === 0 || anyBusy}
            label="Select all members on this page"
            onChange={toggleAll}
          />
          {selectedIds.length > 0 ? (
            <span className="text-[rgb(var(--text))]">
              <span className="num-display font-semibold">{selectedIds.length}</span> selected
            </span>
          ) : (
            <span>Select members to gift</span>
          )}
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            aria-label="Gift tier"
            className={selectCls}
            value={giftTier}
            disabled={anyBusy}
            onChange={(e) => setGiftTier(e.target.value as "pro" | "max")}
          >
            <option value="pro">Pro</option>
            <option value="max">Max</option>
          </select>
          <select
            aria-label="Gift duration"
            className={selectCls}
            value={giftDuration}
            disabled={anyBusy}
            onChange={(e) => setGiftDuration(e.target.value as Duration)}
          >
            {DURATIONS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          {selectedIds.length > 0 && (
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => setSelected(new Set())}
              className="rounded-lg border border-[rgb(var(--muted)/0.6)] px-2.5 py-1.5 text-xs soft-text transition hover:bg-[rgb(var(--text)/0.05)] disabled:opacity-40"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            disabled={anyBusy || selectedIds.length === 0}
            title={selectedIds.length === 0 ? "Tick at least one member first." : undefined}
            onClick={giftSelected}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[rgb(var(--accent)/0.6)] px-3 py-1.5 text-xs font-medium text-[rgb(var(--accent))] transition hover:bg-[rgb(var(--accent)/0.1)] disabled:opacity-40"
          >
            <Gift className="h-3.5 w-3.5" />
            {gifting
              ? "Gifting…"
              : selectedIds.length > 0
                ? `Gift ${TIERS[giftTier].name} to ${selectedIds.length}`
                : `Gift ${TIERS[giftTier].name}`}
          </button>
        </div>
      </div>

      {/* Mobile: a stacked card list — every member's data is fully visible
          without horizontal scroll. md+: the original table. */}
      <ol className="divide-y divide-[rgb(var(--muted)/0.35)] md:hidden">
        {rows.map((row) => {
          const isSelf = row.id === currentAdminId;
          return (
            <li key={row.id} className={selected.has(row.id) ? "bg-[rgb(var(--accent)/0.06)] p-4" : "p-4"}>
              <div className="flex items-start gap-1">
                <SelectBox
                  checked={selected.has(row.id)}
                  disabled={anyBusy}
                  label={`Select @${row.username}`}
                  padClass="-m-2 p-2"
                  onChange={(next) => toggleOne(row.id, next)}
                />
                <Link
                  href={`/admin/users/${row.id}` as Route}
                  className="flex flex-1 items-start justify-between gap-3 active:opacity-80"
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
              </div>
              <div className="mt-3 rounded-lg border border-[rgb(var(--muted)/0.35)] p-2.5">
                <MembershipEditor
                  key={`${row.tier}:${row.expiresAt ?? ""}:${row.isPermanent}`}
                  row={row}
                  busy={busy === row.id || gifting}
                  onApply={(tier, duration) => changeMembership(row, tier, duration)}
                  onRefund={() => revokeMembership(row, "refund")}
                  onCancel={() => revokeMembership(row, "cancel")}
                />
              </div>
              {!isSelf && (
                <button
                  type="button"
                  disabled={busy === row.id || gifting}
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
              <th className="w-9 px-3 py-2">
                <SelectBox
                  checked={allSelected}
                  indeterminate={selectedIds.length > 0}
                  disabled={rows.length === 0 || anyBusy}
                  label="Select all members on this page"
                  onChange={toggleAll}
                />
              </th>
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
                  className={
                    selected.has(row.id)
                      ? "border-t border-[rgb(var(--muted)/0.35)] bg-[rgb(var(--accent)/0.06)] align-top transition"
                      : "border-t border-[rgb(var(--muted)/0.35)] align-top transition hover:bg-[rgb(var(--text)/0.04)]"
                  }
                >
                  <td className="px-3 py-3">
                    <SelectBox
                      checked={selected.has(row.id)}
                      disabled={anyBusy}
                      label={`Select @${row.username}`}
                      onChange={(next) => toggleOne(row.id, next)}
                    />
                  </td>
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
                      key={`${row.tier}:${row.expiresAt ?? ""}:${row.isPermanent}`}
                      row={row}
                      busy={busy === row.id || gifting}
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
                        disabled={busy === row.id || gifting}
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
                <td colSpan={7} className="px-3 py-8 text-center text-sm soft-text">
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
