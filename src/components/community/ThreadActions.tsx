"use client";

import {
  editThread,
  editReply,
  deleteThread,
  deleteReply,
  toggleThreadPin,
  toggleThreadLock,
} from "@/app/(marketing)/community/actions";
import { ThreadHeader } from "./ThreadHeader";
import { PostCard } from "./PostCard";
import type { ForumThreadWithAuthor, ForumPostWithAuthor } from "@/types/database";

interface ThreadActionsProps {
  thread: ForumThreadWithAuthor;
  opPost: ForumPostWithAuthor;
  replies: ForumPostWithAuthor[];
  topicName: string;
  currentUserId: string | null;
  isAdmin: boolean;
}

export function ThreadActions({
  thread,
  opPost,
  replies,
  topicName,
  currentUserId,
  isAdmin,
}: ThreadActionsProps) {
  return (
    <>
      <ThreadHeader
        thread={thread}
        topicName={topicName}
        isAdmin={isAdmin}
        onTogglePin={isAdmin ? toggleThreadPin : undefined}
        onToggleLock={isAdmin ? toggleThreadLock : undefined}
        onDelete={
          isAdmin || (currentUserId && thread.author_id === currentUserId)
            ? deleteThread
            : undefined
        }
      />

      {/* OP post */}
      <div className="border-b border-border">
        <PostCard
          post={opPost}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onEdit={
            isAdmin || (currentUserId && opPost.author_id === currentUserId)
              ? (id: string, body: string) => editThread(thread.id, body)
              : undefined
          }
          onDelete={
            isAdmin || (currentUserId && thread.author_id === currentUserId)
              ? deleteThread
              : undefined
          }
        />
      </div>

      {/* Replies */}
      {replies.length > 0 && (
        <div className="divide-y divide-border">
          {replies.map((reply) => (
            <PostCard
              key={reply.id}
              post={reply}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
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
    </>
  );
}
