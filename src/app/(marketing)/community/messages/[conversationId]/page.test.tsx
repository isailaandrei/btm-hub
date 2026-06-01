import { describe, expect, it, vi } from "vitest";

const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

const { default: ConversationPage } = await import("./page");

describe("legacy conversation route", () => {
  it("redirects old Supabase DM deep links to the Stream messages surface", async () => {
    await expect(ConversationPage()).rejects.toThrow(
      "NEXT_REDIRECT:/community/messages",
    );

    expect(mockRedirect).toHaveBeenCalledWith("/community/messages");
  });
});
