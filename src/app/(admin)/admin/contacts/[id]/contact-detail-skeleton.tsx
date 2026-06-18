import { Skeleton } from "@/components/ui/skeleton";

/** Full-page loading state for the contact detail view (route + client panel). */
export function ContactDetailSkeleton() {
  return (
    <div className="mx-auto max-w-5xl">
      <Skeleton className="mb-3 h-4 w-32 bg-card" />
      <Skeleton className="mb-2 h-9 w-64 bg-card" />
      <div className="mb-8 flex flex-wrap gap-4">
        <Skeleton className="h-5 w-56 bg-card" />
        <Skeleton className="h-5 w-40 bg-card" />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <ContactDetailApplicationsSkeleton />
          <ContactDetailTimelineSkeleton />
        </div>

        <div className="min-w-0 space-y-6">
          <div className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="mb-4 h-5 w-16" />
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-6 w-20 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <Skeleton className="mb-4 h-5 w-20" />
            <Skeleton className="aspect-video w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Applications column placeholder — used while bootstrap data loads. */
export function ContactDetailApplicationsSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Skeleton className="mb-5 h-5 w-36" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

/** Timeline column placeholder — used while bootstrap data loads. */
export function ContactDetailTimelineSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <Skeleton className="mb-5 h-5 w-24" />
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex gap-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
