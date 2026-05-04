import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAppendEmailEvent = vi.fn();
const mockGetEmailRecipientByProviderMessage = vi.fn();
const mockRecordProviderNewsletterUnsubscribe = vi.fn();
const mockSuppressEmailFromProvider = vi.fn();
const mockUpdateEmailSendCounts = vi.fn();
const mockUpdateRecipientForProviderEvent = vi.fn();
const mockUpdateEmailSentContactEventDeliveryStatus = vi.fn();
const mockCreateBrevoEmailProvider = vi.fn();
const mockGetBrevoWebhookToken = vi.fn();

vi.mock("@/lib/data/email-sends", () => ({
  appendEmailEvent: mockAppendEmailEvent,
  getEmailRecipientByProviderMessage: mockGetEmailRecipientByProviderMessage,
  recordProviderNewsletterUnsubscribe: mockRecordProviderNewsletterUnsubscribe,
  suppressEmailFromProvider: mockSuppressEmailFromProvider,
  updateEmailSendCounts: mockUpdateEmailSendCounts,
  updateRecipientForProviderEvent: mockUpdateRecipientForProviderEvent,
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
}));

describe("Brevo webhook route", () => {
  beforeEach(() => {
    mockAppendEmailEvent.mockReset();
    mockGetEmailRecipientByProviderMessage.mockReset();
    mockRecordProviderNewsletterUnsubscribe.mockReset();
    mockSuppressEmailFromProvider.mockReset();
    mockUpdateEmailSendCounts.mockReset();
    mockUpdateRecipientForProviderEvent.mockReset();
    mockUpdateEmailSentContactEventDeliveryStatus.mockReset();
    mockCreateBrevoEmailProvider.mockReset();
    mockGetBrevoWebhookToken.mockReset().mockReturnValue("secret");
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
});
