import { describe, expect, it } from "vitest";
import { createFakeEmailProvider } from "./fake";

describe("fake email provider", () => {
  it("returns stable message ids for sent messages", async () => {
    const provider = createFakeEmailProvider();
    const first = await provider.sendEmail({
      recipientId: "recipient-1",
      to: "person@example.com",
      from: "BTM <hello@mail.behind-the-mask.com>",
      replyTo: "r-recipient-1@replies.behind-the-mask.com",
      subject: "Hello",
      html: "<p>Hello</p>",
      text: "Hello",
      metadata: { campaignId: "campaign-1" },
    });

    expect(first).toEqual({
      provider: "fake",
      providerMessageId: "fake-recipient-1",
      raw: { accepted: true },
    });
  });

  it("normalizes fake delivery webhooks", async () => {
    const provider = createFakeEmailProvider();
    const event = await provider.parseWebhook({
      type: "email.delivered",
      id: "event-1",
      messageId: "fake-recipient-1",
      occurredAt: "2026-04-28T12:00:00.000Z",
    });

    expect(event).toEqual({
      kind: "event",
      event: {
        type: "delivered",
        provider: "fake",
        providerEventId: "event-1",
        providerMessageId: "fake-recipient-1",
        occurredAt: "2026-04-28T12:00:00.000Z",
        payload: {
          type: "email.delivered",
          id: "event-1",
          messageId: "fake-recipient-1",
          occurredAt: "2026-04-28T12:00:00.000Z",
        },
      },
    });
  });
});
