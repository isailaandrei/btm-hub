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
  it("does not server-render the messages sidebar so hidden mobile sidebars do not start chat traffic", () => {
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
  });
});
