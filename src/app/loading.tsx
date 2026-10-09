export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-[max(env(safe-area-inset-top),1rem)]" aria-busy="true">
      <div className="animate-shimmer mb-4 h-8 w-44 rounded-xl bg-surface-2" />
      <div className="animate-shimmer mb-3 h-12 rounded-2xl bg-surface-2" />
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="animate-shimmer h-10 w-28 shrink-0 rounded-full bg-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="animate-shimmer h-52 rounded-3xl border border-line bg-surface" />
        ))}
      </div>
    </div>
  );
}
