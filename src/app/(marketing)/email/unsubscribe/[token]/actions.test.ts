import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUnsubscribeNewsletterByToken = vi.fn();

class RedirectError extends Error {
  url: string;
  constructor(url: string) {
    super(`NEXT_REDIRECT: ${url}`);
    this.url = url;
  }
}

vi.mock("@/lib/data/email-sends", () => ({
  unsubscribeNewsletterByToken: mockUnsubscribeNewsletterByToken,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectError(url);
  }),
}));

describe("confirmNewsletterUnsubscribeAction", () => {
  beforeEach(() => {
    mockUnsubscribeNewsletterByToken.mockReset();
  });

  it("updates newsletter preferences only after form submission", async () => {
    mockUnsubscribeNewsletterByToken.mockResolvedValue(true);
    const formData = new FormData();
    formData.set("token", "unsubscribe-token");

    const { confirmNewsletterUnsubscribeAction } = await import("./actions");

    await expect(confirmNewsletterUnsubscribeAction(formData)).rejects.toMatchObject({
      url: "/email/unsubscribe/unsubscribe-token?status=confirmed",
    });
    expect(mockUnsubscribeNewsletterByToken).toHaveBeenCalledWith(
      "unsubscribe-token",
    );
  });
});
