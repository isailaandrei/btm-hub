const SKELETON_ROWS = 6;
const SKELETON_COLUMNS = 7;

export function ContactsPanelSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-9 w-40 rounded bg-muted" />

      <div className="mb-6 flex flex-wrap gap-3">
        <div className="h-10 w-full max-w-64 rounded bg-muted" />
        <div className="h-10 w-44 rounded bg-muted" />
        <div className="h-10 w-36 rounded bg-muted" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="h-5 w-36 rounded bg-muted" />
        <div className="h-8 w-44 rounded bg-muted" />
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[48px_repeat(7,minmax(112px,1fr))] border-b border-border bg-card px-3 py-3">
            {Array.from({ length: SKELETON_COLUMNS + 1 }).map((_, index) => (
              <div key={index} className="px-2">
                <div className="h-4 rounded bg-muted" />
              </div>
            ))}
          </div>

          {Array.from({ length: SKELETON_ROWS }).map((_, rowIndex) => (
            <div
              key={rowIndex}
              className="grid grid-cols-[48px_repeat(7,minmax(112px,1fr))] border-b border-border px-3 py-4 last:border-0"
            >
              {Array.from({ length: SKELETON_COLUMNS + 1 }).map(
                (_, columnIndex) => (
                  <div key={columnIndex} className="px-2">
                    <div
                      className={`h-4 rounded bg-muted ${
                        columnIndex % 3 === 0
                          ? "w-2/3"
                          : columnIndex % 2 === 0
                            ? "w-4/5"
                            : "w-full"
                      }`}
                    />
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
