"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { HumanCheck, type HumanCheckHandle } from "@/components/ui/human-check";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function AdminLoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [verificationToken, setVerificationToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const humanCheckRef = useRef<HumanCheckHandle>(null);
  const router = useRouter();
  const pathname = usePathname();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setMessage("");
    setLoading(true);

    try {
      if (!verificationToken) {
        setError(true);
        setMessage("Please complete human verification.");
        return;
      }

      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, verificationToken })
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        // The server already consumed the single-use verification token, so a
        // retry with the same one would fail — issue a fresh challenge.
        humanCheckRef.current?.reset();
        setError(true);
        setMessage(data.message ?? "Admin login failed.");
        return;
      }

      setError(false);
      setMessage("Admin access granted. Redirecting...");
      if (pathname !== "/admin") {
        router.push("/admin");
        router.refresh();
      }
    } catch {
      humanCheckRef.current?.reset();
      setError(true);
      setMessage("Admin login request failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="container-shell py-10">
      <form onSubmit={onSubmit} className="surface-card premium-border mx-auto max-w-md space-y-4 rounded-2xl p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-[rgb(var(--accent))]" />
          <h1 className="text-2xl font-semibold">Admin login</h1>
        </div>
        <p className="text-sm soft-text">Use admin credentials only. Non-admin users cannot enter the admin workspace.</p>

        <div>
          <label className="mb-1 block text-xs soft-text">Email or username</label>
          <Input value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-xs soft-text">Password</label>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <HumanCheck ref={humanCheckRef} action="admin-login" onToken={setVerificationToken} />

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Authorizing..." : "Enter admin workspace"}
        </Button>

        {message && <p className={`text-sm ${error ? "text-red-500" : "text-emerald-500"}`}>{message}</p>}

        <p className="text-xs soft-text">
          Need normal access? <Link href="/login" className="text-[rgb(var(--accent))]">Use user login</Link>.
        </p>
      </form>
    </main>
  );
}
