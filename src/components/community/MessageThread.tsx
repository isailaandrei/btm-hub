"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble } from "./MessageBubble";
import { MessageComposer } from "./MessageComposer";
import { markAsRead } from "@/app/(marketing)/community/messages/actions";
import type { DmMessageWithSender, OptimisticDmMessage, Profile } from "@/types/database";

const MESSAGES_PAGE_SIZE = 50;
import type { RealtimeChannel } from "@supabase/supabase-js";

interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  initialMessages: DmMessageWithSender[];
  recipientLastReadAt: string | null;
}

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  recipientLastReadAt,
}: MessageThreadProps) {
  const [messages, setMessages] = useState<OptimisticDmMessage[]>(initialMessages);
  const [lastReadAt, setLastReadAt] = useState<string | null>(recipientLastReadAt);
  const [hasMore, setHasMore] = useState(initialMessages.length >= MESSAGES_PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  // Track likes: messageId → { liked by current user, total count }
  const [likesMap, setLikesMap] = useState<Record<string, { liked: boolean; count: number }>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  function addOptimisticMessage(body: string) {
    const optimistic: OptimisticDmMessage = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      sender_id: currentUserId,
      body,
      body_format: "html",
      edited_at: null,
      deleted_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sender: null,
      _optimistic: "sending",
    };
    setMessages((prev) => [...prev, optimistic]);
  }

  async function loadOlderMessages() {
    if (isLoadingMore || !hasMore || messages.length === 0) return;

    const oldest = messages.find((m) => !m._optimistic);
    if (!oldest) return;

    setIsLoadingMore(true);
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from("dm_messages")
        .select("*, profiles!dm_messages_sender_fkey(id, display_name, avatar_url)")
        .eq("conversation_id", conversationId)
        .or(`created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(MESSAGES_PAGE_SIZE);

      if (error) throw error;

      const olderMessages: OptimisticDmMessage[] = (data ?? []).reverse().map((row) => ({
        id: row.id,
        conversation_id: row.conversation_id,
        sender_id: row.sender_id,
        body: row.body,
        body_format: row.body_format as "text" | "html",
        edited_at: row.edited_at,
        deleted_at: row.deleted_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        sender: (row.profiles as Pick<Profile, "id" | "display_name" | "avatar_url">) ?? null,
      }));

      if (olderMessages.length < MESSAGES_PAGE_SIZE) setHasMore(false);

      if (olderMessages.length > 0) {
        // Preserve scroll position
        const scrollEl = scrollRef.current;
        const prevScrollHeight = scrollEl?.scrollHeight ?? 0;

        setMessages((prev) => [...olderMessages, ...prev]);

        // Restore scroll position after React renders
        requestAnimationFrame(() => {
          if (scrollEl) {
            scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
          }
        });
      }
    } catch {
      // Silently fail — user can try scrolling up again
    } finally {
      setIsLoadingMore(false);
    }
  }

  // Scroll to bottom on mount
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, []);

  // Fetch likes for all messages on mount
  useEffect(() => {
    async function fetchLikes() {
      const supabase = getSupabase();
      const messageIds = initialMessages.map((m) => m.id);
      if (messageIds.length === 0) return;

      const { data: allLikes } = await supabase
        .from("dm_message_likes")
        .select("message_id, user_id")
        .in("message_id", messageIds);

      if (!allLikes) return;

      const map: Record<string, { liked: boolean; count: number }> = {};
      for (const like of allLikes) {
        if (!map[like.message_id]) map[like.message_id] = { liked: false, count: 0 };
        map[like.message_id].count++;
        if (like.user_id === currentUserId) map[like.message_id].liked = true;
      }
      setLikesMap(map);
    }
    fetchLikes();
  }, [initialMessages, currentUserId]);

  // Scroll to bottom when new messages are added at the end
  const prevMessageCountRef = useRef(initialMessages.length);
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      // Only auto-scroll if the newest message is actually new (not from pagination)
      if (lastMsg && !isLoadingMore) {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
    }
    prevMessageCountRef.current = messages.length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only trigger on count change, not on messages array identity
  }, [messages.length, isLoadingMore]);

  // Load older messages when scrolled to top
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function handleScroll() {
      if (el!.scrollTop < 100 && hasMore && !isLoadingMore) {
        loadOlderMessages();
      }
    }

    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadOlderMessages reads messages via closure; adding it would cause infinite loop
  }, [hasMore, isLoadingMore, messages]);

  // Mark conversation as read only when the tab is visible
  useEffect(() => {
    function markIfVisible() {
      if (document.visibilityState === "visible") {
        markAsRead(conversationId);
      }
    }

    // Mark on mount if already visible
    markIfVisible();

    // Mark when tab becomes visible (user switches back to this tab)
    document.addEventListener("visibilitychange", markIfVisible);
    return () => document.removeEventListener("visibilitychange", markIfVisible);
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

            // Mark as read only if the tab is visible
            if (document.visibilityState === "visible") {
              markAsRead(conversationId);
            }
          } else {
            // Own message — we already know our profile
            newMsg.sender = null; // Will be rendered as "own" message
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === newMsg.id)) return prev;
            // Remove optimistic messages from same sender (they've been confirmed)
            const withoutOptimistic = newMsg.sender_id === currentUserId
              ? prev.filter((m) => !m._optimistic)
              : prev;
            return [...withoutOptimistic, newMsg];
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
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_read_receipts",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const receipt = payload.new as { user_id: string; last_read_at: string };
            if (receipt.user_id !== currentUserId) {
              setLastReadAt(receipt.last_read_at);
            }
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "dm_message_likes",
        },
        (payload) => {
          const like = payload.new as { message_id: string; user_id: string };
          if (like.user_id !== currentUserId) {
            setLikesMap((prev) => ({
              ...prev,
              [like.message_id]: {
                liked: prev[like.message_id]?.liked ?? false,
                count: (prev[like.message_id]?.count ?? 0) + 1,
              },
            }));
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "dm_message_likes",
        },
        (payload) => {
          const like = payload.old as { message_id: string; user_id: string };
          if (like.user_id !== currentUserId) {
            setLikesMap((prev) => ({
              ...prev,
              [like.message_id]: {
                liked: prev[like.message_id]?.liked ?? false,
                count: Math.max((prev[like.message_id]?.count ?? 1) - 1, 0),
              },
            }));
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId]);

  // Find the last own message (non-optimistic, non-deleted) that the recipient has read
  const lastSeenMessageId = (() => {
    if (!lastReadAt) return null;
    const readTime = new Date(lastReadAt).getTime();
    let result: string | null = null;
    for (const msg of messages) {
      if (
        msg.sender_id === currentUserId &&
        !msg._optimistic &&
        msg.deleted_at === null &&
        new Date(msg.created_at).getTime() <= readTime
      ) {
        result = msg.id;
      }
    }
    return result;
  })();

  return (
    <>
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              No messages yet. Start the conversation!
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {isLoadingMore && (
              <div className="flex justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isOwn={msg.sender_id === currentUserId}
                showSeen={msg.id === lastSeenMessageId}
                liked={likesMap[msg.id]?.liked ?? false}
              />
            ))}
          </div>
        )}
      </div>
      <MessageComposer conversationId={conversationId} onSend={addOptimisticMessage} />
    </>
  );
}
