"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "./RelativeTime";
import type { ForumThreadWithAuthor } from "@/types/database";

interface ThreadHeaderProps {
  thread: ForumThreadWithAuthor;
  topicName?: string | null;
  currentUserId?: string | null;
  isAdmin?: boolean;
  onTogglePin?: (threadId: string) => Promise<void>;
  onToggleLock?: (threadId: string) => Promise<void>;
  onDelete?: (threadId: string) => Promise<void>;
}

export function ThreadHeader({
  thread,
  topicName,
  currentUserId,
  isAdmin = false,
  onTogglePin,
  onToggleLock,
  onDelete,
}: ThreadHeaderProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const authorName = thread.author?.display_name ?? "[deleted user]";

  function handlePin() {
    if (!onTogglePin) return;
    setError(null);
    startTransition(async () => {
      try { await onTogglePin(thread.id); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to toggle pin"); }
    });
  }

  function handleLock() {
    if (!onToggleLock) return;
    setError(null);
    startTransition(async () => {
      try { await onToggleLock(thread.id); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to toggle lock"); }
    });
  }

  function handleDelete() {
    if (!onDelete) return;
    if (!confirm("Delete this thread and all its replies?")) return;
    setError(null);
    startTransition(async () => {
      try { await onDelete(thread.id); }
      catch (e) { setError(e instanceof Error ? e.message : "Failed to delete thread"); }
    });
  }

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {topicName && (
          <Link href={`/community?topic=${thread.topic}`}>
            <Badge variant="secondary" className="hover:bg-secondary/80">
              {topicName}
            </Badge>
          </Link>
        )}
        {thread.pinned && <Badge variant="default">Pinned</Badge>}
        {thread.locked && <Badge variant="outline">Locked</Badge>}
      </div>

      <h1 className="text-2xl font-bold text-foreground mb-2">
        {thread.title}
      </h1>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{authorName}</span>
        {currentUserId && thread.author_id && thread.author_id !== currentUserId && (
          <Link
            href={`/community/messages?start=${thread.author_id}`}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-primary"
            title={`Message ${authorName}`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </Link>
        )}
        <span>&middot;</span>
        <RelativeTime date={thread.created_at} />
        <span>&middot;</span>
        <span>
          {thread.reply_count} {thread.reply_count === 1 ? "reply" : "replies"}
        </span>
      </div>

      {isAdmin && (
        <div className="mt-3 flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePin}
            disabled={isPending}
          >
            {thread.pinned ? "Unpin" : "Pin"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLock}
            disabled={isPending}
          >
            {thread.locked ? "Unlock" : "Lock"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isPending}
            className="text-destructive hover:text-destructive"
          >
            Delete Thread
          </Button>
        </div>
      )}
      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
