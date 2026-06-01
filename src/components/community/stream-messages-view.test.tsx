import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  channelList: vi.fn(),
}));

function Shell({ children }: { children?: ReactNode }) {
  return <div>{children}</div>;
}

vi.mock("stream-chat-react", () => ({
  Chat: Shell,
  Channel: Shell,
  Window: Shell,
  ChannelHeader: () => null,
  ChannelList: (props: Record<string, unknown>) => {
    mocks.channelList(props);
    return <div />;
  },
  MessageComposer: () => null,
  MessageList: () => null,
  Thread: () => null,
  useChatContext: () => ({ channel: null }),
}));

const { StreamMessagesView } = await import("./stream-messages-view");

describe("StreamMessagesView", () => {
  it("does not request presence for the conversation list", () => {
    renderToStaticMarkup(
      <StreamMessagesView
        client={{} as never}
        onStartDirectConversation={vi.fn()}
        userId="00000000-0000-4000-8000-000000000001"
      />,
    );

    expect(mocks.channelList).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          presence: false,
          state: true,
        }),
      }),
    );
  });

  it("renders a member search entry point above previous messages", () => {
    const html = renderToStaticMarkup(
      <StreamMessagesView
        client={{} as never}
        onStartDirectConversation={vi.fn()}
        userId="00000000-0000-4000-8000-000000000001"
      />,
    );

    expect(html).toContain("Search members");
    expect(html).toContain("Previous messages");
  });
});
