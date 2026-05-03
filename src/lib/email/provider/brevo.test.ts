import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBrevoEmailProvider } from "./brevo";

describe("createBrevoEmailProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends Brevo payload with recipient as an array of email objects", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "message-1" }),
    });

    const provider = createBrevoEmailProvider("brevo-key");
    await provider.sendEmail({
      recipientId: "recipient-1",
      sendId: "send-1",
      contactId: "contact-1",
      to: "test@example.com",
      fromEmail: "owner@example.com",
      fromName: "Behind The Mask",
      replyTo: "owner@example.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
      metadata: { sendId: "send-1" },
    });

    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as {
      to: unknown;
    };
    expect(body.to).toEqual([{ email: "test@example.com" }]);
  });
});
