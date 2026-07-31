export default function CabinetLoading() {
  return (
    <div className="space-y-6 py-4">
      <div className="space-y-3">
        <div className="h-6 w-28 animate-pulse rounded-full bg-panel" />
        <div className="h-12 w-80 animate-pulse rounded-panel bg-panel" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="h-32 animate-pulse rounded-card border border-line bg-panel"
              />
            ))}
          </div>
          <div className="h-[28rem] animate-pulse rounded-section border border-line bg-panel" />
        </div>

        <div className="space-y-6">
          <div className="h-64 animate-pulse rounded-section border border-line bg-panel" />
          <div className="h-80 animate-pulse rounded-section border border-line bg-panel" />
        </div>
      </div>
    </div>
  );
}
