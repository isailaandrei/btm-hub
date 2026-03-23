import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "./RelativeTime";
import { getForumTopic } from "@/lib/community/topics";
import { Heart, MessageCircle } from "lucide-react";
import type { ForumThreadSummary } from "@/types/database";

export function FeedCard({ thread }: { thread: ForumThreadSummary }) {
  const authorName = thread.author?.display_name ?? "[deleted user]";
  const initials = (thread.author?.display_name || "?")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const topic = thread.topic ? getForumTopic(thread.topic) : null;

  return (
    <Card className="transition-colors hover:border-primary/30">
      <CardContent className="flex flex-col gap-3">
        {/* Author row */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
            {initials}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              {authorName}
            </span>
            <span className="text-xs text-muted-foreground">
              <RelativeTime date={thread.created_at} />
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {thread.pinned && <Badge variant="secondary">Pinned</Badge>}
            {thread.locked && <Badge variant="outline">Locked</Badge>}
            {topic && (
              <Link href={`/community?topic=${thread.topic}`}>
                <Badge variant="secondary" className="hover:bg-secondary/80">
                  {topic.name}
                </Badge>
              </Link>
            )}
          </div>
        </div>

        {/* Title + preview */}
        <Link
          href={`/community/${thread.slug}`}
          className="group flex flex-col gap-1"
        >
          <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {thread.title}
          </h3>
          {thread.body_preview && (
            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {thread.body_preview}
            </p>
          )}
        </Link>

        {/* Footer */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3.5 w-3.5" />
            {thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3.5 w-3.5" />
            <RelativeTime date={thread.last_reply_at} />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
