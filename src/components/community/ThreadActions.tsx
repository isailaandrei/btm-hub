"use client";

import {
  editThread,
  deleteThread,
  toggleThreadPin,
  toggleThreadLock,
} from "@/app/(marketing)/community/actions";
import { Card } from "@/components/ui/card";
import { ThreadHeader } from "./ThreadHeader";
import { PostCard } from "./PostCard";
import { ThreadRealtime } from "./ThreadRealtime";
import type { ForumThreadWithAuthor, ForumPostWithAuthor, BodyFormat } from "@/types/database";

interface ThreadActionsProps {
  thread: ForumThreadWithAuthor;
  topicName?: string | null;
  opPost: ForumPostWithAuthor;
  replies: ForumPostWithAuthor[];
  currentUserId: string | null;
  isAdmin: boolean;
  likedPostIds?: Set<string>;
}

export function ThreadActions({
  thread,
  topicName,
  opPost,
  replies,
  currentUserId,
  isAdmin,
  likedPostIds = new Set(),
}: ThreadActionsProps) {
  return (
    <>
      <ThreadHeader
        thread={thread}
        topicName={topicName}
        currentUserId={currentUserId}
        isAdmin={isAdmin}
        onTogglePin={isAdmin ? toggleThreadPin : undefined}
        onToggleLock={isAdmin ? toggleThreadLock : undefined}
        onDelete={
          isAdmin || (currentUserId && thread.author_id === currentUserId)
            ? deleteThread
            : undefined
        }
      />

      <Card className="overflow-hidden">
        {/* OP post */}
        <PostCard
          post={opPost}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          liked={likedPostIds.has(opPost.id)}
          onEdit={
            isAdmin || (currentUserId && opPost.author_id === currentUserId)
              ? (_id: string, body: string, bodyFormat: BodyFormat) => editThread(thread.id, body, bodyFormat)
              : undefined
          }
          onDelete={
            isAdmin || (currentUserId && thread.author_id === currentUserId)
              ? deleteThread
              : undefined
          }
        />

        {/* Replies (real-time) */}
        <ThreadRealtime
          threadId={thread.id}
          initialReplies={replies}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          likedPostIds={likedPostIds}
        />
      </Card>
    </>
  );
}
