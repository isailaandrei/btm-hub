"use client";

import { useEffect } from "react";
import type { Channel as StreamChannel, StreamChat } from "stream-chat";
import {
  Channel,
  ChannelHeader,
  ChannelList,
  Chat,
  MessageComposer,
  MessageList,
  Thread,
  Window,
  useChatContext,
} from "stream-chat-react";
import { isUUID } from "@/lib/validation-helpers";

interface StreamMessagesViewProps {
  client: StreamChat;
  userId: string;
  activeCid?: string | null;
  onActiveThreadChange?: (threadId: string, cid: string) => void;
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

export function StreamMessagesView({
  client,
  userId,
  activeCid,
  onActiveThreadChange,
}: StreamMessagesViewProps) {
  const activeChannelId = channelIdFromCid(activeCid);
  const handleChannelSelect = (channel: StreamChannel) => {
    const threadId = threadIdFromChannel(channel);
    if (!threadId || !channel.cid) return;
    onActiveThreadChange?.(threadId, channel.cid);
  };

  return (
    <div className="stream-chat-shell h-[calc(100vh-12rem)] min-h-[560px] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      <Chat client={client}>
        <ActiveChannelObserver onActiveThreadChange={onActiveThreadChange} />
        <div className="flex h-full min-h-0">
          <div className="w-72 shrink-0 border-r border-border bg-background">
            <ChannelList
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
          <div className="min-w-0 flex-1">
            <Channel>
              <Window>
                <ChannelHeader />
                <MessageList />
                <MessageComposer />
              </Window>
              <Thread />
            </Channel>
          </div>
        </div>
      </Chat>
    </div>
  );
}
