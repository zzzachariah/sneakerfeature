export default function UpdatesLoading() {
  return <main className="container-shell py-12 md:py-16" aria-busy="true"><div className="mx-auto max-w-4xl"><div className="h-3 w-24 animate-pulse rounded bg-[rgb(var(--text)/0.08)]" /><div className="mt-4 h-10 w-64 max-w-full animate-pulse rounded bg-[rgb(var(--text)/0.08)]" /><div className="mt-12 space-y-4" aria-hidden="true">{[1, 2, 3].map((key) => <div key={key} className="h-24 animate-pulse border-b border-[rgb(var(--glass-stroke-soft)/0.5)] bg-[rgb(var(--text)/0.02)]" />)}</div></div></main>;
}
