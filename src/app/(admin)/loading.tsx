import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-9 w-48 bg-card" />

      <div className="rounded-lg border border-border bg-card p-6">
        <Skeleton className="mb-4 h-5 w-32" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <Skeleton className="mb-4 h-5 w-24" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}
