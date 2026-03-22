import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "./RelativeTime";
import type { ForumThreadSummary } from "@/types/database";

export function ThreadCard({ thread }: { thread: ForumThreadSummary }) {
  const authorName = thread.author?.display_name ?? "[deleted user]";

  return (
    <Link
      href={`/community/${thread.topic}/${thread.slug}`}
      className="flex flex-col gap-1.5 rounded-lg px-4 py-3.5 transition-colors hover:bg-muted/60"
    >
      <div className="flex items-center gap-2">
        {thread.pinned && <Badge variant="secondary">Pinned</Badge>}
        {thread.locked && <Badge variant="outline">Locked</Badge>}
        <span className="text-sm font-medium text-foreground line-clamp-1">
          {thread.title}
        </span>
      </div>
      {thread.body_preview && (
        <p className="text-xs text-muted-foreground line-clamp-1">
          {thread.body_preview}
        </p>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{authorName}</span>
        <span>&middot;</span>
        <span>
          {thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}
        </span>
        <span>&middot;</span>
        <RelativeTime date={thread.last_reply_at} />
      </div>
    </Link>
  );
}
