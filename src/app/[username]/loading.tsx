export default function PublicProfileLoading() {
  return (
    <div className="min-h-screen bg-[var(--color-background)] px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="h-[28rem] animate-pulse rounded-section border border-line bg-panel" />
          <div className="space-y-6">
            <div className="h-40 animate-pulse rounded-section border border-line bg-panel" />
            <div className="h-64 animate-pulse rounded-section border border-line bg-panel" />
            <div className="h-72 animate-pulse rounded-section border border-line bg-panel" />
          </div>
        </div>
      </div>
    </div>
  );
}
