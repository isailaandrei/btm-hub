import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();
const mockCreateNotification = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

vi.mock("@/lib/data/auth", () => ({
  getAuthUser: vi.fn(),
}));

vi.mock("@/lib/data/notifications", () => ({
  createNotification: mockCreateNotification,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

const { sendMessage } = await import("./actions");
const { getAuthUser } = await import("@/lib/data/auth");

const prevState = {
  errors: null,
  message: "",
  success: false,
  resetKey: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.query.single.mockReset();
  vi.mocked(getAuthUser).mockResolvedValue({ id: "sender-1" } as never);
});

describe("sendMessage", () => {
  it("creates an in-app notification for the other participant", async () => {
    mockSupabase.query.single
      .mockResolvedValueOnce({
        data: {
          id: "conversation-1",
          user1_id: "sender-1",
          user2_id: "recipient-1",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { id: "message-1" },
        error: null,
      });

    const formData = new FormData();
    formData.set("conversationId", "00000000-0000-4000-8000-000000000001");
    formData.set("body", "<p>Hello from the app</p>");
    formData.set("bodyFormat", "html");

    const result = await sendMessage(prevState, formData);

    expect(result.success).toBe(true);
    expect(mockCreateNotification).toHaveBeenCalledWith({
      recipient_id: "recipient-1",
      actor_id: "sender-1",
      type: "dm_message",
      entity_type: "dm_message",
      entity_id: "message-1",
      metadata: {
        conversation_id: "conversation-1",
        body_preview: "Hello from the app",
      },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/community/messages/00000000-0000-4000-8000-000000000001",
    );
  });
});
