import { Skeleton } from "@/components/ui/skeleton";

export default function ConversationLoading() {
  return (
    <div className="flex h-[calc(100vh-12rem)] flex-col rounded-xl bg-card ring-1 ring-foreground/10">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <Skeleton className="h-4 w-36" />
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 p-4">
        <Skeleton className="h-9 w-2/3 rounded-2xl" />
        <Skeleton className="ml-auto h-9 w-1/2 rounded-2xl" />
        <Skeleton className="h-16 w-3/4 rounded-2xl" />
        <Skeleton className="ml-auto h-9 w-2/5 rounded-2xl" />
      </div>
      <div className="border-t border-border px-4 py-3">
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    </div>
  );
}
