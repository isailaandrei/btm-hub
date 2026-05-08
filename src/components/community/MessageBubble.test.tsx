import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageBubble } from "./MessageBubble";
import type { OptimisticDmMessage } from "@/types/database";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/app/(marketing)/community/messages/actions", () => ({
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  toggleMessageLike: vi.fn(),
}));

describe("MessageBubble", () => {
  it("sanitizes stored html before rendering it", () => {
    const message: OptimisticDmMessage = {
      id: "message-1",
      conversation_id: "conversation-1",
      sender_id: "user-2",
      body: '<p>Hello</p><img src="https://example.com/a.jpg" onerror="alert(1)"><script>alert(2)</script>',
      body_format: "html",
      edited_at: null,
      deleted_at: null,
      created_at: "2026-05-08T10:00:00.000Z",
      updated_at: "2026-05-08T10:00:00.000Z",
      sender: { id: "user-2", display_name: "Other User", avatar_url: null },
    };

    const html = renderToStaticMarkup(
      <MessageBubble message={message} isOwn={false} />,
    );

    expect(html).toContain("<p>Hello</p>");
    expect(html).toContain('<img src="https://example.com/a.jpg"');
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<script");
  });
});
