import Link from "next/link";

// Custom 404. Without this, bad URLs and notFound() calls (e.g. an unknown shoe
// slug) rendered Next's bare default page with no nav or branding.
export default function NotFound() {
  return (
    <main className="container-shell flex min-h-[70vh] flex-col items-center justify-center gap-4 py-10 text-center">
      <div className="text-4xl">🔍</div>
      <div>
        <h1 className="text-lg font-semibold">没找到这个页面</h1>
        <p className="mx-auto mt-1 max-w-sm text-sm text-[rgb(var(--text)/0.6)]">
          Page not found. 你要找的鞋款或页面可能已被移动或删除。
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[rgb(var(--text))] px-5 text-sm font-semibold text-[rgb(var(--bg))] transition hover:opacity-90"
        >
          返回首页
        </Link>
        <Link
          href="/search/advanced"
          className="inline-flex h-11 items-center justify-center rounded-xl border border-[rgb(var(--text)/0.15)] px-5 text-sm font-medium transition hover:bg-[rgb(var(--text)/0.06)]"
        >
          搜索鞋款
        </Link>
      </div>
    </main>
  );
}
