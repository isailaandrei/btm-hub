"use client";

import { useState, useRef, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PostBody } from "./PostBody";
import { RelativeTime } from "./RelativeTime";
import { LikeButton } from "./LikeButton";
import { UserAvatar } from "./UserAvatar";
import { MessageCircle, Send } from "lucide-react";
import { createReply } from "@/app/(marketing)/community/actions";
import type { ForumThreadSummary, ForumPostWithAuthor } from "@/types/database";

interface FeedCardProps {
  thread: ForumThreadSummary;
  topReplies?: ForumPostWithAuthor[];
  liked?: boolean;
  isAuthenticated?: boolean;
}

/** Threshold in chars above which the body is collapsed with "See more". */
const COLLAPSE_THRESHOLD = 400;

export function FeedCard({
  thread,
  topReplies = [],
  liked = false,
  isAuthenticated = false,
}: FeedCardProps) {
  const [expanded, setExpanded] = useState(false);
  const authorName = thread.author?.display_name ?? "[deleted user]";
  const isLong = thread.op_body.length > COLLAPSE_THRESHOLD;

  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-0 p-0">
        {/* Author row */}
        <div className="flex items-center gap-2.5 px-4 pt-4">
          <UserAvatar
            name={thread.author?.display_name ?? null}
            avatarUrl={thread.author?.avatar_url}
            size="lg"
          />
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-foreground">
              {authorName}
            </span>
            <span className="text-xs text-muted-foreground">
              <RelativeTime date={thread.created_at} />
              {thread.topic_name && (
                <>
                  {" "}in{" "}
                  <Link
                    href={`/community?topic=${thread.topic}`}
                    className="font-medium text-muted-foreground hover:text-foreground"
                  >
                    {thread.topic_name}
                  </Link>
                </>
              )}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {thread.pinned && <Badge variant="secondary">Pinned</Badge>}
            {thread.locked && <Badge variant="outline">Locked</Badge>}
          </div>
        </div>

        {/* Title */}
        <Link
          href={`/community/${thread.slug}`}
          className="group px-4 pt-3"
        >
          <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
            {thread.title}
          </h3>
        </Link>

        {/* Body (expandable) */}
        <div className="px-4 pt-2">
          {isLong && !expanded ? (
            <div className="relative">
              <div className="text-sm leading-relaxed text-foreground line-clamp-4">
                <PostBody body={thread.op_body} bodyFormat={thread.op_body_format} />
              </div>
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="mt-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                See more
              </button>
            </div>
          ) : (
            <div className="text-sm leading-relaxed text-foreground">
              <PostBody body={thread.op_body} bodyFormat={thread.op_body_format} />
            </div>
          )}
        </div>

        {/* Action bar — Like + Comment */}
        <div className="mt-3 flex items-center border-t border-border px-4 py-1">
          {thread.op_post_id ? (
            <LikeButton
              postId={thread.op_post_id}
              likeCount={thread.op_like_count}
              liked={liked}
            />
          ) : (
            <span className="px-2 py-1 text-xs text-muted-foreground">—</span>
          )}
          <Link
            href={`/community/${thread.slug}`}
            className="ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            {thread.reply_count > 0
              ? `${thread.reply_count} ${thread.reply_count === 1 ? "comment" : "comments"}`
              : "Comment"}
          </Link>
        </div>

        {/* Top replies preview */}
        {topReplies.length > 0 && (
          <div className="border-t border-border bg-muted/30 px-4 py-3">
            <div className="flex flex-col gap-3">
              {topReplies.map((reply) => (
                <ReplyPreview key={reply.id} reply={reply} />
              ))}
            </div>
            {thread.reply_count > topReplies.length && (
              <Link
                href={`/community/${thread.slug}`}
                className="mt-2 block text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                View all {thread.reply_count} comments
              </Link>
            )}
          </div>
        )}

        {/* Inline reply input */}
        {isAuthenticated && !thread.locked && (
          <InlineReplyInput threadId={thread.id} />
        )}
      </CardContent>
    </Card>
  );
}

function ReplyPreview({ reply }: { reply: ForumPostWithAuthor }) {
  const name = reply.author?.display_name ?? "[deleted user]";

  return (
    <div className="flex gap-2">
      <UserAvatar
        name={reply.author?.display_name ?? null}
        avatarUrl={reply.author?.avatar_url}
        size="sm"
      />
      <div className="min-w-0 flex-1">
        <div className="rounded-xl bg-muted px-3 py-2">
          <span className="text-xs font-semibold text-foreground">{name}</span>
          <p className="text-xs leading-relaxed text-foreground line-clamp-2">
            {reply.body_preview || reply.body.slice(0, 200)}
          </p>
        </div>
        <div className="mt-0.5 flex items-center gap-3 px-1 text-[11px] text-muted-foreground">
          <RelativeTime date={reply.created_at} />
          {reply.like_count > 0 && (
            <span className="flex items-center gap-0.5">
              {reply.like_count} {reply.like_count === 1 ? "like" : "likes"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function InlineReplyInput({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim() || isPending) return;

    const formData = new FormData();
    formData.set("threadId", threadId);
    formData.set("body", body.trim());
    formData.set("bodyFormat", "markdown");

    startTransition(async () => {
      const result = await createReply(
        { errors: null, message: "", success: false, resetKey: 0 },
        formData,
      );
      if (result.success) {
        setBody("");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2 border-t border-border px-4 py-2.5"
    >
      <input
        ref={inputRef}
        type="text"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Write a comment..."
        disabled={isPending}
        className="min-w-0 flex-1 rounded-full border border-border bg-muted px-3.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <Button
        type="submit"
        size="icon"
        variant="ghost"
        className="h-8 w-8 shrink-0 text-primary"
        disabled={isPending || !body.trim()}
      >
        <Send className="h-4 w-4" />
      </Button>
    </form>
  );
}
