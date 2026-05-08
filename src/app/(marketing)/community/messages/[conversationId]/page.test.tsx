import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const mockGetAuthUser = vi.fn();
const mockGetConversation = vi.fn();
const mockGetMessages = vi.fn();
const mockGetRecipientLastReadAt = vi.fn();
const mockMessageThread = vi.fn(() => <div data-testid="message-thread" />);

vi.mock("@/lib/data/auth", () => ({
  getAuthUser: mockGetAuthUser,
}));

vi.mock("@/lib/data/messages", () => ({
  getConversation: mockGetConversation,
  getMessages: mockGetMessages,
  getRecipientLastReadAt: mockGetRecipientLastReadAt,
}));

vi.mock("@/components/community/MessageThread", () => ({
  MessageThread: mockMessageThread,
}));

vi.mock("@/components/community/UserAvatar", () => ({
  UserAvatar: () => <div data-testid="avatar" />,
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const { default: ConversationPage } = await import("./page");

describe("ConversationPage", () => {
  it("does not block the initial chat render on recipient read receipts", async () => {
    mockGetAuthUser.mockResolvedValue({ id: "user-1" });
    mockGetConversation.mockResolvedValue({
      id: "conversation-1",
      user1_id: "user-1",
      user2_id: "user-2",
      last_message_at: "2026-05-08T10:00:00.000Z",
      created_at: "2026-05-08T09:00:00.000Z",
      participant: {
        id: "user-2",
        display_name: "Other User",
        avatar_url: null,
      },
    });
    mockGetMessages.mockResolvedValue([]);

    const element = await ConversationPage({
      params: Promise.resolve({ conversationId: "conversation-1" }),
    });
    renderToStaticMarkup(element);

    expect(mockGetRecipientLastReadAt).not.toHaveBeenCalled();
    expect(mockMessageThread).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: "conversation-1",
        currentUserId: "user-1",
        recipientId: "user-2",
        recipientLastReadAt: null,
      }),
      undefined,
    );
  });
});
