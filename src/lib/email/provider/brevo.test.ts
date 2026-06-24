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

    const recipientId = "550e8400-e29b-41d4-a716-446655440040";
    const provider = createBrevoEmailProvider("brevo-key");
    const result = await provider.sendEmail({
      recipientId,
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
    expect(body.headers.idempotencyKey).toBe(recipientId);
    expect(body.headers["Idempotency-Key"]).toBeUndefined();
    expect(result.providerMessageId).toBe("message-1@relay.example.com");
  });

  it("uses a caller-provided idempotency key (per-attempt) over the recipient id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "<message-2@relay.example.com>" }),
    });

    const provider = createBrevoEmailProvider("brevo-key");
    await provider.sendEmail({
      recipientId: "550e8400-e29b-41d4-a716-446655440040",
      idempotencyKey: "550e8400-e29b-41d4-a716-446655440040:2",
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
    };
    expect(body.headers.idempotencyKey).toBe(
      "550e8400-e29b-41d4-a716-446655440040:2",
    );
  });

  it("maps Brevo failure events to deferred (transient), failed, or bounced states", () => {
    const provider = createBrevoEmailProvider("brevo-key");

    const events = provider.parseWebhook([
      { event: "soft_bounce", "message-id": "message-1" },
      { event: "blocked", "message-id": "message-2" },
      { event: "error", "message-id": "message-3" },
      { event: "hard_bounce", "message-id": "message-4" },
      { event: "invalid_email", "message-id": "message-5" },
    ]);

    expect(events.map((event) => event.type)).toEqual([
      // Soft bounces are transient — Brevo retries them, so they're "delivery
      // delayed", not a terminal failure.
      "delivery_delayed",
      "failed",
      "failed",
      "bounced",
      "bounced",
    ]);
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

  it("maps human opens to 'opened' and privacy-proxy opens to a distinct 'proxy_opened' type", () => {
    const provider = createBrevoEmailProvider("brevo-key");

    const events = provider.parseWebhook([
      {
        event: "opened",
        email: "maya@example.com",
        "message-id": "message-1@relay.example.com",
        ts_event: 1604933654,
      },
      {
        event: "unique_opened",
        email: "maya@example.com",
        "message-id": "message-1@relay.example.com",
        ts_event: 1604933655,
      },
      {
        // Apple Mail Privacy Protection pre-fetch — kept, but distinct so it
        // never inflates the real open count.
        event: "proxy_open",
        email: "maya@example.com",
        "message-id": "message-1@relay.example.com",
        ts_event: 1604933656,
      },
      {
        event: "unique_proxy_open",
        email: "maya@example.com",
        "message-id": "message-1@relay.example.com",
        ts_event: 1604933657,
      },
    ]);

    expect(events.map((event) => event.type)).toEqual([
      "opened",
      "opened",
      "proxy_opened",
      "proxy_opened",
    ]);
    expect(events[0]?.providerMessageId).toBe("message-1@relay.example.com");
    expect(events[1]?.rawEvent).toBe("unique_opened");
    expect(events[2]?.rawEvent).toBe("proxy_open");
  });

  it("logs and drops genuinely unknown Brevo event types (fail loud)", () => {
    const provider = createBrevoEmailProvider("brevo-key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const events = provider.parseWebhook([
      { event: "some_new_event", "message-id": "message-9" },
    ]);

    expect(events).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("some_new_event"),
    );
    warn.mockRestore();
  });

  it("defensively maps any proxy-named event variant to proxy_opened (exact string only confirmable in prod)", () => {
    const provider = createBrevoEmailProvider("brevo-key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const events = provider.parseWebhook([
      { event: "unique_proxy_open_v2", "message-id": "m1" },
    ]);

    expect(events.map((event) => event.type)).toEqual(["proxy_opened"]);
    // A recognized proxy variant must NOT trip the fail-loud unmapped warning.
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
