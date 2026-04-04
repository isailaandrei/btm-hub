import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { RelativeTime } from "./RelativeTime";
import { UserAvatar } from "./UserAvatar";
import { MessageCircle, Heart, Pin } from "lucide-react";
import type { ForumThreadSummary } from "@/types/database";

interface ThreadCardProps {
  thread: ForumThreadSummary;
  query?: string;
}

/** Strip HTML tags from a string. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}

/** Split text around case-insensitive matches and wrap them in <mark>. */
function highlightText(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="bg-primary/20 text-foreground rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/**
 * Get the best preview snippet for search results.
 * If the query appears in body_preview, use that.
 * Otherwise, find it in the full body and extract a window around the match.
 */
function getSearchPreview(thread: ForumThreadSummary, query: string): string {
  // Always search in the full body so we can center the snippet on the match
  const fullText =
    thread.op_body_format === "html" ? stripHtml(thread.op_body) : thread.op_body;
  const idx = fullText.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return thread.body_preview;

  // Extract a window centered on the match
  const windowSize = 80;
  const start = Math.max(0, idx - windowSize);
  const end = Math.min(fullText.length, idx + query.length + windowSize);
  let snippet = fullText.slice(start, end).trim();
  if (start > 0) snippet = `...${snippet}`;
  if (end < fullText.length) snippet = `${snippet}...`;
  return snippet;
}

export function ThreadCard({ thread, query }: ThreadCardProps) {
  const authorName = thread.author?.display_name ?? "[deleted user]";
  const previewText = query
    ? getSearchPreview(thread, query)
    : thread.body_preview;

  return (
    <Link href={`/community/${thread.slug}`} className="group block">
      <Card className="py-0 transition-colors group-hover:border-primary/30">
        <CardContent className="flex gap-3 px-3">
          <UserAvatar
            name={thread.author?.display_name ?? null}
            avatarUrl={thread.author?.avatar_url}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            {/* Title row */}
            <div className="flex items-start gap-2">
              <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {query ? highlightText(thread.title, query) : thread.title}
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
              {query ? highlightText(previewText, query) : previewText}
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
