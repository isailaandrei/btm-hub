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
  it("renders messages as a separate community tool below the forum channels", () => {
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
    expect(html).toContain("Direct");
    expect(html).toContain("Messages");
    expect(html).toContain("/community/messages");
    expect(html.indexOf("Gear")).toBeLessThan(html.indexOf("Direct"));
    expect(html.indexOf("New Post")).toBeLessThan(html.indexOf("Direct"));
    expect(html.indexOf("Direct")).toBeLessThan(html.indexOf("Messages"));
    expect(html).not.toContain("stream-chat-shell");
    expect(html).not.toContain("Connecting to messages");
  });
});
