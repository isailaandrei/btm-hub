import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "./RelativeTime";
import { UserAvatar } from "./UserAvatar";
import { MessageCircle, Heart, Pin } from "lucide-react";
import type { ForumThreadSummary } from "@/types/database";

interface ThreadCardProps {
  thread: ForumThreadSummary;
}

export function ThreadCard({ thread }: ThreadCardProps) {
  const authorName = thread.author?.display_name ?? "[deleted user]";

  return (
    <Link href={`/community/${thread.slug}`} className="group block">
      <Card className="transition-colors group-hover:border-primary/30">
        <CardContent className="flex gap-3 px-3 py-2">
          <UserAvatar
            name={thread.author?.display_name ?? null}
            avatarUrl={thread.author?.avatar_url}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            {/* Title row */}
            <div className="flex items-start gap-2">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {thread.title}
              </h3>
              {thread.pinned && (
                <Pin className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              )}
              {thread.locked && (
                <Badge variant="outline" className="shrink-0 text-[10px] px-1 py-0">
                  Locked
                </Badge>
              )}
            </div>

            {/* Body preview */}
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
              {thread.body_preview}
            </p>

            {/* Meta row */}
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              <span>{authorName}</span>
              <span className="flex items-center gap-0.5">
                <MessageCircle className="h-3 w-3" />
                {thread.reply_count}
              </span>
              {thread.op_like_count > 0 && (
                <span className="flex items-center gap-0.5">
                  <Heart className="h-3 w-3" />
                  {thread.op_like_count}
                </span>
              )}
              <RelativeTime date={thread.last_reply_at} />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
