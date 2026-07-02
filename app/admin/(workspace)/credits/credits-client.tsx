"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { confirmDialog } from "@/components/native/native-menu";

type CreditRow = {
  userId: string;
  username: string | null;
  email: string | null;
  balance: number;
  updatedAt: string;
};

export function CreditsClient() {
  const [rows, setRows] = useState<CreditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Form state for manual grant.
  const [grantUser, setGrantUser] = useState("");
  const [grantCredits, setGrantCredits] = useState<string>("");
  const [grantNote, setGrantNote] = useState("");

  // Form state for clear.
  const [clearUser, setClearUser] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/credits${search ? `?q=${encodeURIComponent(search)}` : ""}`);
      const json = await res.json();
      if (json?.ok) setRows(json.rows as CreditRow[]);
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGrant = useCallback(async () => {
    setMessage(null);
    const n = Number(grantCredits);
    if (!grantUser.trim() || !Number.isInteger(n) || n <= 0) {
      setMessage("Enter a username and a positive integer credit amount.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "grant", username: grantUser.trim(), credits: n, note: grantNote.trim() || undefined })
      });
      const json = await res.json();
      if (!json?.ok) {
        setMessage(json?.message ?? "Failed");
      } else {
        setMessage(`Granted ${json.granted} credits to ${grantUser}. New balance: ${json.balance}.`);
        setGrantUser(""); setGrantCredits(""); setGrantNote("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }, [grantUser, grantCredits, grantNote, load]);

  const handleClear = useCallback(async () => {
    setMessage(null);
    if (!clearUser.trim()) {
      setMessage("Enter a username to clear.");
      return;
    }
    if (!(await confirmDialog({ message: `Clear all credits for "${clearUser}"? This cannot be undone.`, okLabel: "Clear", destructive: true }))) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear", username: clearUser.trim() })
      });
      const json = await res.json();
      if (!json?.ok) {
        setMessage(json?.message ?? "Failed");
      } else {
        setMessage(`Cleared. Previous balance was ${json.previous}.`);
        setClearUser("");
        await load();
      }
    } finally {
      setBusy(false);
    }
  }, [clearUser, load]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <h2 className="text-base font-semibold">Manual credit operations</h2>
        <p className="mt-1 text-xs soft-text">Username must match the user&apos;s profiles.username exactly.</p>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-[rgb(var(--muted)/0.4)] p-3">
            <p className="text-sm font-semibold">Grant credits</p>
            <Input className="mt-2" placeholder="Username" value={grantUser} onChange={(e) => setGrantUser(e.target.value)} />
            <Input className="mt-2" placeholder="Credits (positive integer)" inputMode="numeric" value={grantCredits} onChange={(e) => setGrantCredits(e.target.value)} />
            <Input className="mt-2" placeholder="Note (optional)" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} />
            <Button onClick={handleGrant} disabled={busy} className="mt-3 w-full">Grant</Button>
          </div>

          <div className="rounded-lg border border-[rgb(var(--muted)/0.4)] p-3">
            <p className="text-sm font-semibold">Clear balance</p>
            <Input className="mt-2" placeholder="Username" value={clearUser} onChange={(e) => setClearUser(e.target.value)} />
            <Button variant="secondary" onClick={handleClear} disabled={busy} className="mt-3 w-full">
              Reset balance to 0
            </Button>
          </div>
        </div>

        {message && <p className="mt-3 text-sm">{message}</p>}
      </Card>

      <Card className="p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
          <h2 className="truncate text-base font-semibold">All user balances</h2>
          <Input className="min-w-0 sm:ml-auto sm:max-w-xs" placeholder="Search username or email…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button onClick={load} className="min-h-[44px] shrink-0 rounded-full border border-[rgb(var(--muted)/0.5)] px-4 text-sm hover:bg-[rgb(var(--muted)/0.25)] active:bg-[rgb(var(--muted)/0.25)] md:min-h-0 md:px-3 md:py-2 md:text-xs">Refresh</button>
        </div>

        {loading ? (
          <p className="mt-3 text-sm soft-text">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-3 text-sm soft-text">No balances.</p>
        ) : (
          <>
            {/* Mobile: stacked cards. md+: original table. */}
            <ol className="mt-3 divide-y divide-[rgb(var(--muted)/0.25)] md:hidden">
              {rows.map((r) => (
                <li key={r.userId} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.username ?? "—"}</div>
                      <div className="truncate text-xs soft-text">{r.email ?? ""}</div>
                      <div className="num-display mt-1 text-[0.7rem] soft-text">
                        updated {new Date(r.updatedAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="num-display text-xl font-semibold tabular-nums">{r.balance}</div>
                      <div className="text-[0.6rem] uppercase tracking-wide soft-text">credits</div>
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setGrantUser(r.username ?? "");
                    }}
                    className="mt-2 w-full"
                  >
                    Pre-fill grant
                  </Button>
                </li>
              ))}
            </ol>

            <div className="mt-3 hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider soft-text">
                  <tr className="border-b border-[rgb(var(--muted)/0.4)]">
                    <th className="px-2 py-2">User</th>
                    <th className="px-2 py-2">Balance</th>
                    <th className="px-2 py-2">Updated</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.userId} className="border-b border-[rgb(var(--muted)/0.25)]">
                      <td className="px-2 py-2">
                        <div className="font-medium">{r.username ?? "—"}</div>
                        <div className="text-xs soft-text">{r.email ?? ""}</div>
                      </td>
                      <td className="px-2 py-2 tabular-nums font-semibold">{r.balance}</td>
                      <td className="px-2 py-2 text-xs soft-text">{new Date(r.updatedAt).toLocaleString()}</td>
                      <td className="px-2 py-2">
                        <Button variant="secondary" onClick={() => { setGrantUser(r.username ?? ""); }}>Pre-fill grant</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
