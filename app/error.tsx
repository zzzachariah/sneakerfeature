"use client";

import { useEffect, useState } from "react";

// Top-level error boundary. In the Capacitor shell the WebView reloads the live
// site when the app resumes from the background; a transient fetch failure during
// that reload (the radio often sleeps in the background and wakes a beat late)
// would otherwise dead-end here with a bare message and no way out. So give the
// user a real recovery path: retry the failed segment, hard-reload, and retry
// automatically when connectivity comes back.
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  // `online` only fires on an offline→online transition, so this can't loop.
  useEffect(() => {
    const onOnline = () => {
      setRetrying(true);
      reset();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [reset]);

  return (
    <main className="container-shell flex min-h-[60vh] flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="text-4xl">😵‍💫</div>
      <div>
        <h1 className="text-lg font-semibold">出错了，请重试</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[rgb(var(--text)/0.6)]">
          Something went wrong. 如果你刚从其他 App 切回来，多半是临时网络抖动，重试一下通常就好。
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => {
            setRetrying(true);
            reset();
          }}
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[rgb(var(--text))] px-5 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
        >
          {retrying ? "重试中…" : "重试"}
        </button>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex h-11 items-center justify-center rounded-xl border border-[rgb(var(--text)/0.15)] px-5 text-sm font-medium transition hover:bg-[rgb(var(--text)/0.06)]"
        >
          重新加载
        </button>
      </div>
    </main>
  );
}
