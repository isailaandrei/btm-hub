"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { PostCard } from "./PostCard";
import { editReply, deleteReply } from "@/app/(marketing)/community/actions";
import type { ForumPostWithAuthor, Profile } from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface ThreadRealtimeProps {
  threadId: string;
  initialReplies: ForumPostWithAuthor[];
  currentUserId: string | null;
  isAdmin: boolean;
  likedPostIds: Set<string>;
}

export function ThreadRealtime({
  threadId,
  initialReplies,
  currentUserId,
  isAdmin,
  likedPostIds,
}: ThreadRealtimeProps) {
  const [replies, setReplies] = useState<ForumPostWithAuthor[]>(initialReplies);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Sync with server-rendered data when props change (e.g. after revalidation).
  // This is the React-recommended "previous value in state" pattern (replaces
  // getDerivedStateFromProps) — updating state during render is safe when
  // guarded by a comparison. See: https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [prevInitial, setPrevInitial] = useState(initialReplies);
  if (initialReplies !== prevInitial) {
    setPrevInitial(initialReplies);
    setReplies(initialReplies);
  }

  useEffect(() => {
    const supabase = getSupabase();

    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "forum_posts",
          filter: `thread_id=eq.${threadId}`,
        },
        async (payload) => {
          const newPost = payload.new as ForumPostWithAuthor;

          // Skip OP posts
          if (newPost.is_op) return;

          // Fetch author profile
          if (newPost.author_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, display_name, avatar_url")
              .eq("id", newPost.author_id)
              .single();

            newPost.author = (profile as Pick<Profile, "id" | "display_name" | "avatar_url">) ?? null;
          }

          // Default fields that may not be in the Realtime payload
          if (newPost.like_count === undefined) newPost.like_count = 0;
          if (newPost.body_preview === undefined) newPost.body_preview = "";

          setReplies((prev) => {
            if (prev.some((r) => r.id === newPost.id)) return prev;
            return [...prev, newPost];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "forum_posts",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const updated = payload.new as ForumPostWithAuthor;
          setReplies((prev) =>
            prev.map((r) => {
              if (r.id !== updated.id) return r;
              return { ...updated, author: r.author };
            }),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "forum_posts",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const deleted = payload.old as { id: string };
          setReplies((prev) => prev.filter((r) => r.id !== deleted.id));
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [threadId]);

  return (
    <>
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
    </>
  );
}
