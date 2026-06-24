import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAppendEmailEvent = vi.fn();
const mockUpdateRecipientForProviderEventByRecipient = vi.fn();
const mockGetEmailRecipientByProviderMessage = vi.fn();
const mockRecordProviderNewsletterUnsubscribe = vi.fn();
const mockSuppressEmailFromProvider = vi.fn();
const mockSuppressUnsubscribedEmail = vi.fn();
const mockUpdateEmailSendCounts = vi.fn();
const mockUpdateRecipientForProviderEvent = vi.fn();
const mockUpdateEmailSentContactEventDeliveryStatus = vi.fn();
const mockCreateBrevoEmailProvider = vi.fn();
const mockGetBrevoWebhookToken = vi.fn();
const mockIsProductionEmailEnvironment = vi.fn();

vi.mock("@/lib/data/email-sends", () => ({
  appendEmailEvent: mockAppendEmailEvent,
  getEmailRecipientByProviderMessage: mockGetEmailRecipientByProviderMessage,
  recordProviderNewsletterUnsubscribe: mockRecordProviderNewsletterUnsubscribe,
  suppressEmailFromProvider: mockSuppressEmailFromProvider,
  suppressUnsubscribedEmail: mockSuppressUnsubscribedEmail,
  updateEmailSendCounts: mockUpdateEmailSendCounts,
  updateRecipientForProviderEvent: mockUpdateRecipientForProviderEvent,
  updateRecipientForProviderEventByRecipient:
    mockUpdateRecipientForProviderEventByRecipient,
}));

vi.mock("@/lib/data/contact-events", () => ({
  updateEmailSentContactEventDeliveryStatus:
    mockUpdateEmailSentContactEventDeliveryStatus,
}));

vi.mock("@/lib/email/provider/brevo", () => ({
  createBrevoEmailProvider: mockCreateBrevoEmailProvider,
}));

vi.mock("@/lib/email/settings", () => ({
  getBrevoWebhookToken: mockGetBrevoWebhookToken,
  isProductionEmailEnvironment: mockIsProductionEmailEnvironment,
}));

describe("Brevo webhook route", () => {
  beforeEach(() => {
    mockAppendEmailEvent.mockReset();
    mockUpdateRecipientForProviderEventByRecipient.mockReset();
    mockGetEmailRecipientByProviderMessage.mockReset();
    mockRecordProviderNewsletterUnsubscribe.mockReset();
    mockSuppressEmailFromProvider.mockReset();
    mockSuppressUnsubscribedEmail.mockReset();
    mockUpdateEmailSendCounts.mockReset();
    mockUpdateRecipientForProviderEvent.mockReset();
    mockUpdateEmailSentContactEventDeliveryStatus.mockReset();
    mockCreateBrevoEmailProvider.mockReset();
    mockGetBrevoWebhookToken.mockReset().mockReturnValue("secret");
    mockIsProductionEmailEnvironment
      .mockReset()
      .mockImplementation(() => process.env.VERCEL_ENV === "production");
  });

  it("persists provider unsubscribe events to newsletter preferences", async () => {
    mockCreateBrevoEmailProvider.mockReturnValue({
      parseWebhook: () => [
        {
          type: "unsubscribed",
          provider: "brevo",
          providerEventId: "brevo-event-1",
          providerMessageId: "message-1",
          occurredAt: "2026-05-01T00:00:00.000Z",
          rawEvent: "unsubscribed",
          payload: { event: "unsubscribed" },
        },
      ],
    });
    mockUpdateRecipientForProviderEvent.mockResolvedValue({
      id: "recipient-1",
      send_id: "send-1",
      contact_id: "contact-1",
      email: "maya@example.com",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/email/webhooks/brevo?token=secret", {
        method: "POST",
        body: JSON.stringify({ event: "unsubscribed" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockRecordProviderNewsletterUnsubscribe).toHaveBeenCalledWith({
      contactId: "contact-1",
      source: "provider:brevo",
    });
    // Flat exclusion: the unsubscribe also lands on the suppression list.
    expect(mockSuppressUnsubscribedEmail).toHaveBeenCalledWith({
      contactId: "contact-1",
      email: "maya@example.com",
      source: "provider:brevo",
    });
  });

  it("updates contact timeline delivery status when Brevo confirms delivery", async () => {
    mockCreateBrevoEmailProvider.mockReturnValue({
      parseWebhook: () => [
        {
          type: "delivered",
          provider: "brevo",
          providerEventId: "brevo-event-1",
          providerMessageId: "message-1",
          occurredAt: "2026-05-01T00:00:00.000Z",
          rawEvent: "delivered",
          payload: { event: "delivered" },
        },
      ],
    });
    mockUpdateRecipientForProviderEvent.mockResolvedValue({
      id: "recipient-1",
      send_id: "send-1",
      contact_id: "contact-1",
      email: "maya@example.com",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/email/webhooks/brevo?token=secret", {
        method: "POST",
        body: JSON.stringify({ event: "delivered" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateEmailSentContactEventDeliveryStatus).toHaveBeenCalledWith({
      recipientId: "recipient-1",
      deliveryStatus: "delivered",
      occurredAt: "2026-05-01T00:00:00.000Z",
    });
  });

  it("records open events without overwriting clicked recipient status", async () => {
    mockCreateBrevoEmailProvider.mockReturnValue({
      parseWebhook: () => [
        {
          type: "opened",
          provider: "brevo",
          providerEventId: "brevo-open-1",
          providerMessageId: "message-1",
          occurredAt: "2026-05-01T00:01:00.000Z",
          rawEvent: "opened",
          payload: { event: "opened" },
        },
      ],
    });
    mockUpdateRecipientForProviderEvent.mockResolvedValue({
      id: "recipient-1",
      send_id: "send-1",
      contact_id: "contact-1",
      email: "maya@example.com",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/email/webhooks/brevo?token=secret", {
        method: "POST",
        body: JSON.stringify({ event: "opened" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateRecipientForProviderEvent).toHaveBeenCalledWith({
      provider: "brevo",
      providerMessageId: "message-1",
      status: "delivered",
      timestampField: "opened_at",
      occurredAt: "2026-05-01T00:01:00.000Z",
    });
    expect(mockAppendEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "opened",
        recipientId: "recipient-1",
      }),
    );
    expect(mockUpdateEmailSentContactEventDeliveryStatus).toHaveBeenCalledWith({
      recipientId: "recipient-1",
      deliveryStatus: "delivered",
      occurredAt: "2026-05-01T00:01:00.000Z",
    });
  });

  it("maps Brevo error events to failed recipient diagnostics", async () => {
    mockCreateBrevoEmailProvider.mockReturnValue({
      parseWebhook: () => [
        {
          type: "failed",
          provider: "brevo",
          providerEventId: "brevo-error-1",
          providerMessageId: "message-1",
          occurredAt: "2026-05-01T00:01:00.000Z",
          rawEvent: "error",
          payload: { event: "error", reason: "invalid sender" },
        },
      ],
    });
    mockUpdateRecipientForProviderEvent.mockResolvedValue({
      id: "recipient-1",
      send_id: "send-1",
      contact_id: "contact-1",
      email: "maya@example.com",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/email/webhooks/brevo", {
        method: "POST",
        headers: { "x-brevo-webhook-token": "secret" },
        body: JSON.stringify({ event: "error" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateRecipientForProviderEvent).toHaveBeenCalledWith({
      provider: "brevo",
      providerMessageId: "message-1",
      status: "failed",
      timestampField: "bounced_at",
      occurredAt: "2026-05-01T00:01:00.000Z",
    });
    expect(mockUpdateEmailSentContactEventDeliveryStatus).toHaveBeenCalledWith({
      recipientId: "recipient-1",
      deliveryStatus: "not_delivered",
      occurredAt: "2026-05-01T00:01:00.000Z",
    });
  });

  it("maps a delivery-delayed (soft bounce) event to a non-terminal deferred state", async () => {
    mockCreateBrevoEmailProvider.mockReturnValue({
      parseWebhook: () => [
        {
          type: "delivery_delayed",
          provider: "brevo",
          providerEventId: "brevo-defer-1",
          providerMessageId: "message-1",
          occurredAt: "2026-05-01T00:01:00.000Z",
          rawEvent: "soft_bounce",
          payload: { event: "soft_bounce", reason: "450 mailbox unavailable" },
        },
      ],
    });
    mockUpdateRecipientForProviderEvent.mockResolvedValue({
      id: "recipient-1",
      send_id: "send-1",
      contact_id: "contact-1",
      email: "maya@example.com",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/email/webhooks/brevo", {
        method: "POST",
        headers: { "x-brevo-webhook-token": "secret" },
        body: JSON.stringify({ event: "soft_bounce" }),
      }),
    );

    expect(response.status).toBe(200);
    // The recipient moves to the transient "deferred" state, not "failed".
    expect(mockUpdateRecipientForProviderEvent).toHaveBeenCalledWith({
      provider: "brevo",
      providerMessageId: "message-1",
      status: "deferred",
      timestampField: "deferred_at",
      occurredAt: "2026-05-01T00:01:00.000Z",
    });
    // A deferral is not a delivery outcome, so the contact event is left alone.
    expect(mockUpdateEmailSentContactEventDeliveryStatus).not.toHaveBeenCalled();
  });

  it("applies webhook events by signed recipient metadata, independent of the provider message id (race-proof)", async () => {
    mockCreateBrevoEmailProvider.mockReturnValue({
      parseWebhook: () => [
        {
          type: "delivered",
          provider: "brevo",
          providerEventId: "brevo-event-1",
          providerMessageId: "message-1",
          occurredAt: "2026-05-01T00:00:00.000Z",
          rawEvent: "delivered",
          payload: {
            event: "delivered",
            "X-Mailin-custom": JSON.stringify({
              sendId: "send-1",
              recipientId: "recipient-1",
              contactId: "contact-1",
            }),
          },
        },
      ],
    });
    // The send-path has NOT stored the provider_message_id yet (the fast-delivery
    // race). The handler must still land the event via the recipient id.
    mockUpdateRecipientForProviderEventByRecipient.mockResolvedValue({
      id: "recipient-1",
      send_id: "send-1",
      contact_id: "contact-1",
      email: "maya@example.com",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/email/webhooks/brevo", {
        method: "POST",
        headers: { "x-brevo-webhook-token": "secret" },
        body: JSON.stringify({ event: "delivered" }),
      }),
    );

    expect(response.status).toBe(200);
    // Applied deterministically by recipient id from the metadata.
    expect(
      mockUpdateRecipientForProviderEventByRecipient,
    ).toHaveBeenCalledWith({
      recipientId: "recipient-1",
      provider: "brevo",
      providerMessageId: "message-1",
      status: "delivered",
      timestampField: "delivered_at",
      occurredAt: "2026-05-01T00:00:00.000Z",
    });
    // The fragile msgid match is not needed once metadata resolves the recipient.
    expect(mockUpdateRecipientForProviderEvent).not.toHaveBeenCalled();
    expect(mockAppendEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sendId: "send-1",
        recipientId: "recipient-1",
      }),
    );
  });

  it("falls back to provider-message-id matching for events without our metadata", async () => {
    mockCreateBrevoEmailProvider.mockReturnValue({
      parseWebhook: () => [
        {
          type: "delivered",
          provider: "brevo",
          providerEventId: "brevo-event-2",
          providerMessageId: "message-2",
          occurredAt: "2026-05-01T00:00:00.000Z",
          rawEvent: "delivered",
          payload: { event: "delivered" },
        },
      ],
    });
    mockUpdateRecipientForProviderEvent.mockResolvedValue({
      id: "recipient-2",
      send_id: "send-2",
      contact_id: "contact-2",
      email: "sam@example.com",
    });

    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost/api/email/webhooks/brevo", {
        method: "POST",
        headers: { "x-brevo-webhook-token": "secret" },
        body: JSON.stringify({ event: "delivered" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(
      mockUpdateRecipientForProviderEventByRecipient,
    ).not.toHaveBeenCalled();
    expect(mockUpdateRecipientForProviderEvent).toHaveBeenCalledWith({
      provider: "brevo",
      providerMessageId: "message-2",
      status: "delivered",
      timestampField: "delivered_at",
      occurredAt: "2026-05-01T00:00:00.000Z",
    });
    expect(mockAppendEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "recipient-2" }),
    );
  });

  it("rejects query-token webhook auth in production", async () => {
    process.env.VERCEL_ENV = "production";
    try {
      mockCreateBrevoEmailProvider.mockReturnValue({
        parseWebhook: () => [],
      });

      const { POST } = await import("./route");
      const response = await POST(
        new Request("http://localhost/api/email/webhooks/brevo?token=secret", {
          method: "POST",
          body: JSON.stringify({ event: "delivered" }),
        }),
      );

      expect(response.status).toBe(401);
    } finally {
      delete process.env.VERCEL_ENV;
    }
  });
});
