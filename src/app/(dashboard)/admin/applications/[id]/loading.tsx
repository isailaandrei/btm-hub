import { Skeleton } from "@/components/ui/skeleton";

export default function ApplicationDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-64 bg-card" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-6 w-20 rounded-full" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-6">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-6"
            >
              <Skeleton className="mb-4 h-5 w-36" />
              <div className="flex flex-col gap-3">
                {[20, 24, 16].map((w, j) => (
                  <div key={j} className="flex flex-col gap-1">
                    <Skeleton className="h-3" style={{ width: `${w * 4}px` }} />
                    <Skeleton className="h-4" style={{ width: `${w * 4 + 112}px` }} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-6">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card p-6"
            >
              <Skeleton className="mb-3 h-4 w-16" />
              <Skeleton className="h-8 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
