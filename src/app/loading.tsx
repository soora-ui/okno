export default function Loading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="h-20 rounded-full border border-[var(--color-line,#d7c7b2)] bg-panel" />
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-[28px] border border-[var(--color-line,#d7c7b2)] bg-panel"
                />
              ))}
            </div>
            <div className="h-[28rem] animate-pulse rounded-[32px] border border-[var(--color-line,#d7c7b2)] bg-panel" />
          </div>
          <div className="space-y-6">
            <div className="h-64 animate-pulse rounded-[32px] border border-[var(--color-line,#d7c7b2)] bg-panel" />
            <div className="h-72 animate-pulse rounded-[32px] border border-[var(--color-line,#d7c7b2)] bg-panel" />
          </div>
        </div>
      </div>
    </div>
  );
}
