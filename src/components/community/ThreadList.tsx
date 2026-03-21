import type { ForumThreadSummary } from "@/types/database";
import { ThreadCard } from "./ThreadCard";

interface ThreadListProps {
  threads: ForumThreadSummary[];
  emptyMessage?: string;
}

export function ThreadList({
  threads,
  emptyMessage = "No threads yet. Be the first to start a discussion!",
}: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <p className="text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="divide-y-0">
      {threads.map((thread) => (
        <ThreadCard key={thread.id} thread={thread} />
      ))}
    </div>
  );
}
