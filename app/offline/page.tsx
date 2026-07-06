"use client";

import { useEffect, useState } from "react";

// Offline fallback. The service worker precaches this route and serves it when a
// full-page navigation fails with no network (public/sw.js networkFirst). It must
// stay self-contained — no data fetching — since by definition it renders while
// the device is offline. When connectivity returns we auto-reload.
export default function OfflinePage() {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const onOnline = () => {
      setRetrying(true);
      window.location.reload();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  return (
    <main className="container-shell flex min-h-[70vh] flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="text-4xl">📡</div>
      <div>
        <h1 className="text-lg font-semibold">你现在处于离线状态</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[rgb(var(--text)/0.6)]">
          You&apos;re offline. 网络恢复后页面会自动重新加载，你也可以手动重试。
        </p>
      </div>
      <button
        onClick={() => {
          setRetrying(true);
          window.location.reload();
        }}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-[rgb(var(--text))] px-5 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
      >
        {retrying ? "重试中…" : "重试"}
      </button>
    </main>
  );
}
