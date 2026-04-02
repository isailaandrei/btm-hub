"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { markAsRead } from "@/app/(marketing)/community/messages/actions";
import type { DmMessageWithSender, Profile } from "@/types/database";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: DmMessageWithSender[];
}

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<DmMessageWithSender[]>(initialMessages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Mark conversation as read on mount
  useEffect(() => {
    markAsRead(conversationId);
  }, [conversationId]);

  // Subscribe to real-time messages
  useEffect(() => {
    const supabase = getSupabase();

    const channel = supabase
      .channel(`dm:messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMsg = payload.new as DmMessageWithSender;

          // Fetch sender profile if not current user
          if (newMsg.sender_id !== currentUserId) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("id, display_name, avatar_url")
              .eq("id", newMsg.sender_id)
              .single();

            newMsg.sender = (profile as Pick<Profile, "id" | "display_name" | "avatar_url">) ?? null;

            // Mark as read since we're viewing this conversation
            markAsRead(conversationId);
          } else {
            // Own message — we already know our profile
            newMsg.sender = null; // Will be rendered as "own" message
          }

          setMessages((prev) => {
            // Prevent duplicates (action might have already added it via revalidation)
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            return [...prev, newMsg];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as DmMessageWithSender;
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== updated.id) return m;
              // Preserve the sender profile from the existing message
              return { ...updated, sender: m.sender };
            }),
          );
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
      {messages.length === 0 ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-muted-foreground">
            No messages yet. Start the conversation!
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              isOwn={msg.sender_id === currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
}
