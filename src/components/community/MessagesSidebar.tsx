"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface MessagesSidebarProps {
  currentUserId: string;
}

interface SearchResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface SidebarConversation {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  participant: { id: string; display_name: string | null; avatar_url: string | null } | null;
  unread_count: number;
}

export function MessagesSidebar({ currentUserId }: MessagesSidebarProps) {
  const pathname = usePathname();
  const [conversations, setConversations] = useState<SidebarConversation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  function getSupabase() {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    return supabaseRef.current;
  }

  // Fetch conversations on mount (avoids blocking the community layout)
  useEffect(() => {
    async function loadConversations() {
      const supabase = getSupabase();

      const { data: convs } = await supabase
        .from("dm_conversations")
        .select("*")
        .or(`user1_id.eq.${currentUserId},user2_id.eq.${currentUserId}`)
        .order("last_message_at", { ascending: false })
        .limit(30);

      if (!convs || convs.length === 0) {
        setIsLoaded(true);
        return;
      }

      // Get other participants' profiles
      const otherIds = [...new Set(convs.map((c) =>
        c.user1_id === currentUserId ? c.user2_id : c.user1_id,
      ))];

      const [{ data: profiles }, { data: unreadRows }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, avatar_url").in("id", otherIds),
        supabase.rpc("dm_unread_counts", { _user_id: currentUserId }),
      ]);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const unreadMap = new Map((unreadRows ?? []).map((r: { conversation_id: string; unread_count: number }) => [r.conversation_id, r.unread_count]));

      setConversations(convs.map((c) => {
        const otherId = c.user1_id === currentUserId ? c.user2_id : c.user1_id;
        return {
          ...c,
          participant: profileMap.get(otherId) ?? null,
          unread_count: unreadMap.get(c.id) ?? 0,
        };
      }));
      setIsLoaded(true);
    }

    loadConversations();
  }, [currentUserId]);

  // Real-time: update conversation order when last_message_at changes
  // Note: We only subscribe to dm_conversations (filtered by user participation via RLS)
  // and dm_read_receipts. We do NOT subscribe to dm_messages globally — that would
  // cause O(users * messages) RLS evaluations. Instead, new message counts are
  // derived from conversation updates (the trigger updates last_message_at on each send).
  useEffect(() => {
    const supabase = getSupabase();

    const channel = supabase
      .channel(`dm:sidebar:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "dm_conversations",
        },
        (payload) => {
          const updated = payload.new as { id: string; last_message_at: string };
          setConversations((prev) => {
            const next = prev.map((c) =>
              c.id === updated.id
                ? { ...c, last_message_at: updated.last_message_at, unread_count: c.unread_count + 1 }
                : c,
            );
            // Re-sort by last_message_at descending
            return next.sort((a, b) =>
              new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime(),
            );
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_read_receipts",
          filter: `user_id=eq.${currentUserId}`,
        },
        (payload) => {
          // Clear unread count when user reads a conversation
          if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
            const receipt = payload.new as { conversation_id: string };
            setConversations((prev) =>
              prev.map((c) =>
                c.id === receipt.conversation_id
                  ? { ...c, unread_count: 0 }
                  : c,
              ),
            );
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId]);

  // Debounced user search
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/community/mention-search?q=${encodeURIComponent(searchQuery)}`,
        );
        if (res.ok) {
          const data = await res.json();
          // Filter out current user and existing conversation partners
          const existingPartnerIds = new Set(
            conversations.map((c) => c.participant?.id).filter(Boolean),
          );
          setSearchResults(
            (data as SearchResult[]).filter(
              (u) => u.id !== currentUserId && !existingPartnerIds.has(u.id),
            ),
          );
        }
      } catch {
        // Silently fail search
      } finally {
        setIsSearching(false);
      }
    }, 200);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery, currentUserId, conversations]);

  function getInitials(name: string | null): string {
    return (name || "?")
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between px-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Messages
        </h2>
        {!showSearch && (
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
            title="New message"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Inline search */}
      {showSearch && (
        <div className="mb-2 px-1">
          <div className="flex items-center gap-1">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search users..."
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                autoFocus
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
              className="rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Search results */}
          {searchResults.length > 0 && (
            <div className="mt-1 rounded-md border border-border bg-background py-1">
              {searchResults.map((user) => (
                <Link
                  key={user.id}
                  href={`/community/messages?start=${user.id}`}
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery("");
                    setSearchResults([]);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-primary">
                    {getInitials(user.display_name)}
                  </span>
                  <span className="truncate">{user.display_name || "Unknown"}</span>
                </Link>
              ))}
            </div>
          )}

          {searchQuery.length >= 2 && searchResults.length === 0 && !isSearching && (
            <p className="mt-1 px-2 text-xs text-muted-foreground">No users found</p>
          )}
        </div>
      )}

      {/* Conversation list */}
      <nav className="flex flex-col gap-0.5">
        {conversations.map((conv) => {
          const isActive = pathname === `/community/messages/${conv.id}`;
          return (
            <Link
              key={conv.id}
              href={`/community/messages/${conv.id}`}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-1.5 text-sm transition-colors",
                isActive
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <span className="flex items-center gap-2 truncate">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-medium text-primary">
                  {getInitials(conv.participant?.display_name ?? null)}
                </span>
                <span className="truncate">{conv.participant?.display_name || "Unknown"}</span>
              </span>

              {conv.unread_count > 0 && (
                <span className="ml-1 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
                  {conv.unread_count > 99 ? "99+" : conv.unread_count}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {conversations.length === 0 && isLoaded && !showSearch && (
        <p className="px-3 text-xs text-muted-foreground">
          No conversations yet
        </p>
      )}
    </div>
  );
}
