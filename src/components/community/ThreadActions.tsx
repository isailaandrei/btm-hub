"use client";

import {
  editThread,
  editReply,
  deleteThread,
  deleteReply,
  toggleThreadPin,
  toggleThreadLock,
} from "@/app/(marketing)/community/actions";
import { Card } from "@/components/ui/card";
import { ThreadHeader } from "./ThreadHeader";
import { PostCard } from "./PostCard";
import type { ForumThreadWithAuthor, ForumPostWithAuthor } from "@/types/database";

interface ThreadActionsProps {
  thread: ForumThreadWithAuthor;
  opPost: ForumPostWithAuthor;
  replies: ForumPostWithAuthor[];
  currentUserId: string | null;
  isAdmin: boolean;
  likedPostIds?: Set<string>;
}

export function ThreadActions({
  thread,
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
              ? (_id: string, body: string) => editThread(thread.id, body, opPost.body_format)
              : undefined
          }
          onDelete={
            isAdmin || (currentUserId && thread.author_id === currentUserId)
              ? deleteThread
              : undefined
          }
        />

        {/* Replies */}
        {replies.length > 0 && (
          <div className="divide-y divide-border border-t border-border">
            {replies.map((reply) => (
              <PostCard
                key={reply.id}
                post={reply}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                liked={likedPostIds.has(reply.id)}
                onEdit={
                  isAdmin || (currentUserId && reply.author_id === currentUserId)
                    ? editReply
                    : undefined
                }
                onDelete={
                  isAdmin || (currentUserId && reply.author_id === currentUserId)
                    ? deleteReply
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
