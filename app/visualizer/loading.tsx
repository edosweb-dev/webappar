export default function VisualizerLoading() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[var(--color-bg)]">
      {/* Header skeleton */}
      <header className="flex flex-shrink-0 items-center gap-3 border-b border-[var(--color-border)] px-4 py-4">
        <div className="skeleton h-6 w-6 rounded-lg" />
        <div>
          <div className="skeleton mb-1.5 h-4 w-40 rounded" />
          <div className="skeleton h-3 w-56 rounded" />
        </div>
      </header>

      {/* Products grid skeleton */}
      <div className="flex-1 overflow-hidden px-4 py-4">
        <div className="mx-auto max-w-2xl">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl border border-[var(--color-border)]"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="skeleton aspect-[4/3] w-full" />
                <div className="px-3 py-3">
                  <div className="skeleton mb-2 h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
