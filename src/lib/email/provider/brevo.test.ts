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
      json: async () => ({ messageId: "<message-1@relay.example.com>" }),
    });

    const provider = createBrevoEmailProvider("brevo-key");
    const result = await provider.sendEmail({
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
      headers: Record<string, unknown>;
      to: unknown;
    };
    expect(body.to).toEqual([{ email: "test@example.com" }]);
    expect(body.headers["Idempotency-Key"]).toBe("send-1:recipient-1");
    expect(result.providerMessageId).toBe("message-1@relay.example.com");
  });

  it("normalizes documented webhook message ids and creates event-level fingerprints", () => {
    const provider = createBrevoEmailProvider("brevo-key");
    const events = provider.parseWebhook([
      {
        event: "request",
        email: "maya@example.com",
        id: 12345,
        ts: 1604933619,
        "message-id": "201798300811.5787683@relay.domain.com",
        ts_event: 1604933654,
        subject: "My first Transactional",
      },
      {
        event: "delivered",
        email: "maya@example.com",
        id: 12345,
        ts: 1604933619,
        "message-id": "<201798300811.5787683@relay.domain.com>",
        ts_event: 1604933655,
        subject: "My first Transactional",
      },
    ]);

    expect(events).toHaveLength(2);
    expect(events[0]?.providerMessageId).toBe(
      "201798300811.5787683@relay.domain.com",
    );
    expect(events[1]?.providerMessageId).toBe(
      "201798300811.5787683@relay.domain.com",
    );
    expect(events[0]?.providerEventId).not.toBe("12345");
    expect(events[0]?.providerEventId).not.toBe(events[1]?.providerEventId);
  });

  it("ignores open tracking events because they are not reliable CRM metrics", () => {
    const provider = createBrevoEmailProvider("brevo-key");

    expect(
      provider.parseWebhook([
        {
          event: "opened",
          email: "maya@example.com",
          "message-id": "message-1@relay.example.com",
          ts_event: 1604933654,
        },
        {
          event: "unique_proxy_open",
          email: "maya@example.com",
          "message-id": "message-1@relay.example.com",
          ts_event: 1604933655,
        },
      ]),
    ).toEqual([]);
  });
});
