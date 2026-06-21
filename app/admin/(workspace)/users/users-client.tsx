"use client";

import { useState } from "react";
import { Shield, ShieldOff, ShieldCheck } from "lucide-react";
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
};

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
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[rgb(var(--bg-elev)/0.85)] text-left text-xs soft-text">
            <tr>
              <th className="px-3 py-2">Member</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Activity</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isSelf = row.id === currentAdminId;
              return (
                <tr key={row.id} className="border-t border-[rgb(var(--muted)/0.35)] align-top">
                  <td className="px-3 py-3">
                    <div className="font-medium">{row.username}</div>
                    <div className="text-xs soft-text">{row.email}</div>
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
                  <td className="px-3 py-3 text-xs soft-text">
                    <span className="num-display">{row.comments}</span> comments ·{" "}
                    <span className="num-display">{row.ratings}</span> ratings ·{" "}
                    <span className="num-display">{row.favorites}</span> favs ·{" "}
                    <span className="num-display">{row.submissions}</span> subs
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
                <td colSpan={5} className="px-3 py-8 text-center text-sm soft-text">
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
