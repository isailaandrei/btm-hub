import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChannelSidebar } from "./ChannelSidebar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/community",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/(marketing)/community/actions", () => ({
  createTopic: vi.fn(),
}));

describe("ChannelSidebar", () => {
  it("keeps messages out of the forum channel list", () => {
    const html = renderToStaticMarkup(
      <ChannelSidebar
        topics={[
          {
            slug: "gear",
            name: "Gear",
            description: "",
            icon: "hash",
            sort_order: 1,
          },
        ]}
        isAuthenticated
        isAdmin={false}
        currentUserId="user-1"
      />,
    );

    expect(html).toContain("Channels");
    expect(html).not.toContain("Messages");
    expect(html).not.toContain("/community/messages");
    expect(html).not.toContain("stream-chat-shell");
    expect(html).not.toContain("Connecting to messages");
  });
});
