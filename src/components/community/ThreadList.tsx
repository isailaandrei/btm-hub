import { Card, CardContent } from "@/components/ui/card";
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
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="divide-y divide-border">
        {threads.map((thread) => (
          <ThreadCard key={thread.id} thread={thread} />
        ))}
      </div>
    </Card>
  );
}
