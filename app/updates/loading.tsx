export default function UpdatesLoading() {
  return <main className="container-shell py-12 md:py-16" aria-busy="true"><div className="mx-auto max-w-6xl"><div className="h-3 w-24 animate-pulse rounded bg-[rgb(var(--text)/0.08)]" /><div className="mt-4 h-12 w-96 max-w-full animate-pulse rounded bg-[rgb(var(--text)/0.08)]" /><div className="mt-12 grid gap-4 md:grid-cols-2" aria-hidden="true">{[1, 2, 3, 4].map((key) => <div key={key} className="h-72 animate-pulse rounded-2xl border border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--text)/0.02)]" />)}</div></div></main>;
}
