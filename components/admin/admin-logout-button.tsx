"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export function AdminLogoutButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  async function onLogout() {
    setLoading(true);
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      if (pathname !== "/dashboard") {
        router.push("/dashboard");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onLogout}
      disabled={loading}
      className="inline-flex min-h-[44px] md:min-h-[36px] items-center gap-2 rounded-lg border border-[rgb(var(--muted)/0.5)] bg-[rgb(var(--bg-elev)/0.7)] px-3 py-1.5 text-sm hover:bg-[rgb(var(--muted)/0.25)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--text)/0.2)]"
    >
      <LogOut className="h-4 w-4" />
      {loading ? "Exiting..." : "Admin logout"}
    </button>
  );
}
