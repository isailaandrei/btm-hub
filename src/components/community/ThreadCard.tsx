import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { RelativeTime } from "./RelativeTime";
import type { ForumThreadSummary } from "@/types/database";

export function ThreadCard({ thread }: { thread: ForumThreadSummary }) {
  const authorName = thread.author?.display_name ?? "[deleted user]";
  const isEdited = false; // summaries don't carry updated_at

  return (
    <div className="flex flex-col gap-2 border-b border-border px-1 py-4 last:border-b-0">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {thread.pinned && (
              <Badge variant="secondary" className="text-xs">Pinned</Badge>
            )}
            {thread.locked && (
              <Badge variant="outline" className="text-xs">Locked</Badge>
            )}
            <Link
              href={`/community/${thread.topic}/${thread.slug}`}
              className="text-base font-medium text-foreground hover:text-primary transition-colors line-clamp-1"
            >
              {thread.title}
            </Link>
          </div>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {thread.body_preview}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{authorName}</span>
        <span>&middot;</span>
        <span>
          {thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}
        </span>
        <span>&middot;</span>
        <span>
          <RelativeTime date={thread.last_reply_at} />
        </span>
        {isEdited && (
          <>
            <span>&middot;</span>
            <span className="italic">(edited)</span>
          </>
        )}
      </div>
    </div>
  );
}
