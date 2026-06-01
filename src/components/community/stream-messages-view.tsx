"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, Search, UserRound } from "lucide-react";
import type { Channel as StreamChannel, StreamChat } from "stream-chat";
import {
  Channel,
  ChannelHeader,
  ChannelList,
  Chat,
  MessageComposer as StreamMessageComposer,
  MessageList,
  Thread,
  Window,
  useChatContext,
} from "stream-chat-react";
import { isUUID } from "@/lib/validation-helpers";
import { cn } from "@/lib/utils";

interface ProfileSearchResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface StreamMessagesViewProps {
  client: StreamChat;
  userId: string;
  activeCid?: string | null;
  channelListVersion?: number;
  onActiveThreadChange?: (threadId: string, cid: string) => void;
  onStartDirectConversation: (recipientId: string) => Promise<void>;
}

function channelIdFromCid(cid: string | null | undefined) {
  if (!cid) return undefined;
  const [, id] = cid.split(":");
  return id || undefined;
}

function threadIdFromChannel(channel: StreamChannel): string | null {
  const id = channel.id ?? channelIdFromCid(channel.cid);
  return id && isUUID(id) ? id : null;
}

function isProfileSearchResult(value: unknown): value is ProfileSearchResult {
  if (!value || typeof value !== "object") return false;

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    (typeof candidate.display_name === "string" || candidate.display_name === null) &&
    (typeof candidate.avatar_url === "string" || candidate.avatar_url === null)
  );
}

function normalizeSearchResults(value: unknown, currentUserId: string) {
  if (!Array.isArray(value)) {
    throw new Error("Profile search returned an invalid response");
  }

  return value
    .filter(isProfileSearchResult)
    .filter((profile) => profile.id !== currentUserId);
}

function profileLabel(profile: ProfileSearchResult) {
  return profile.display_name?.trim() || "Unnamed member";
}

function profileInitial(profile: ProfileSearchResult) {
  return profileLabel(profile).slice(0, 1).toUpperCase();
}

function ActiveChannelObserver({
  onActiveThreadChange,
}: {
  onActiveThreadChange?: (threadId: string, cid: string) => void;
}) {
  const { channel } = useChatContext("ActiveChannelObserver");

  useEffect(() => {
    if (!channel?.cid) return;

    const threadId = threadIdFromChannel(channel);
    if (!threadId) return;

    onActiveThreadChange?.(threadId, channel.cid);
  }, [channel, onActiveThreadChange]);

  return null;
}

function StartDirectMessageSearch({
  userId,
  onStartDirectConversation,
}: {
  userId: string;
  onStartDirectConversation: (recipientId: string) => Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [startingProfileId, setStartingProfileId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSearching(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/community/mention-search?q=${encodeURIComponent(trimmedQuery)}`,
          { signal: controller.signal },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            typeof body.error === "string" ? body.error : "Failed to search members",
          );
        }

        setResults(normalizeSearchResults(body, userId));
      } catch (err) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(err instanceof Error ? err.message : "Failed to search members");
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [trimmedQuery, userId]);

  async function handleStart(profile: ProfileSearchResult) {
    setStartingProfileId(profile.id);
    setError(null);

    try {
      await onStartDirectConversation(profile.id);
      setQuery("");
      setResults([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start conversation");
    } finally {
      setStartingProfileId(null);
    }
  }

  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor="direct-message-search">
        Search members to message
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id="direct-message-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search members"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-9 text-sm text-foreground shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {error && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
          {error}
        </p>
      )}

      {trimmedQuery.length >= 2 && !isSearching && results.length === 0 && !error && (
        <p className="px-1 text-xs text-muted-foreground">No members found.</p>
      )}

      {results.length > 0 && (
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-border bg-background shadow-sm">
          {results.map((profile) => {
            const isStarting = startingProfileId === profile.id;

            return (
              <li key={profile.id}>
                <button
                  type="button"
                  onClick={() => void handleStart(profile)}
                  disabled={Boolean(startingProfileId)}
                  className={cn(
                    "flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                    isStarting && "bg-accent",
                  )}
                >
                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt=""
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {profileInitial(profile)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">{profileLabel(profile)}</span>
                  {isStarting && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function StreamMessagesView({
  client,
  userId,
  activeCid,
  channelListVersion = 0,
  onActiveThreadChange,
  onStartDirectConversation,
}: StreamMessagesViewProps) {
  const activeChannelId = channelIdFromCid(activeCid);
  const handleChannelSelect = (channel: StreamChannel) => {
    const threadId = threadIdFromChannel(channel);
    if (!threadId || !channel.cid) return;
    onActiveThreadChange?.(threadId, channel.cid);
  };

  return (
    <div className="stream-chat-shell h-[calc(100vh-12rem)] min-h-[620px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <Chat client={client}>
        <ActiveChannelObserver onActiveThreadChange={onActiveThreadChange} />
        <div className="flex h-full min-h-0">
          <div className="flex w-80 shrink-0 flex-col border-r border-border bg-background">
            <div className="border-b border-border p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-semibold text-foreground">Chats</h2>
              </div>
              <StartDirectMessageSearch
                onStartDirectConversation={onStartDirectConversation}
                userId={userId}
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <UserRound className="h-3.5 w-3.5" />
                Previous messages
              </div>
              <ChannelList
                key={channelListVersion}
                customActiveChannel={activeChannelId}
                filters={{ members: { $in: [userId] }, type: "messaging" }}
                sort={{ last_message_at: -1 }}
                options={{ presence: false, state: true }}
                renderChannels={(channels, channelPreview) =>
                  channels.map((channel) => (
                    <div
                      key={channel.cid ?? channel.id}
                      onClick={() => handleChannelSelect(channel)}
                    >
                      {channelPreview(channel)}
                    </div>
                  ))
                }
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <Channel>
              <Window>
                <ChannelHeader />
                <MessageList />
                <StreamMessageComposer />
              </Window>
              <Thread />
            </Channel>
          </div>
        </div>
      </Chat>
    </div>
  );
}
