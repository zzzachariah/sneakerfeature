"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronRight, Shield, ShieldOff, ShieldCheck } from "lucide-react";
import { confirmDialog } from "@/components/native/native-menu";
import { Card } from "@/components/ui/card";

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
              {!isSelf && (
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => changeRole(row)}
                  className={
                    row.role === "admin"
                      ? "mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-400/60 px-3 py-2 text-xs text-rose-400 transition active:bg-rose-400/10 disabled:opacity-50"
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
              <th className="px-3 py-2">Activity</th>
              <th className="px-3 py-2">Last active</th>
              <th className="px-3 py-2">Joined</th>
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
                  <td className="px-3 py-3 text-xs soft-text whitespace-nowrap">
                    <span className="num-display">{row.comments}</span> comments ·{" "}
                    <span className="num-display">{row.ratings}</span> ratings ·{" "}
                    <span className="num-display">{row.favorites}</span> favs ·{" "}
                    <span className="num-display">{row.submissions}</span> subs
                  </td>
                  <td className="num-display whitespace-nowrap px-3 py-3 text-xs soft-text">
                    {relativeFromNow(row.lastActiveAt)}
                  </td>
                  <td className="num-display whitespace-nowrap px-3 py-3 text-xs soft-text">
                    {new Date(row.createdAt).toLocaleDateString()}
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
                            ? "inline-flex items-center gap-1.5 rounded-lg border border-rose-400/60 px-3 py-1.5 text-xs text-rose-400 transition hover:bg-rose-400/10 disabled:opacity-50"
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
