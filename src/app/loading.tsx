export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-[max(env(safe-area-inset-top),1.25rem)]" aria-busy="true">
      <div className="animate-shimmer mb-3 h-9 w-48 rounded-full bg-surface-2" />
      <div className="animate-shimmer mb-5 h-9 w-40 rounded-full bg-surface-2" />
      <div className="animate-shimmer mb-3 h-12 rounded-full bg-surface-2" />
      <div className="mb-6 flex gap-2 overflow-hidden">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="animate-shimmer h-10 w-28 shrink-0 rounded-full bg-surface-2" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="animate-shimmer flex h-64 gap-4 rounded-[26px] border border-line p-4">
            <div className="h-[118px] w-[92px] rounded-[18px] bg-surface-2" />
          </div>
        ))}
      </div>
    </div>
  );
}
