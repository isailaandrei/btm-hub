import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailProvider, ProviderSendEmailInput } from "./provider/types";
import type { EmailSend, EmailSendRecipient } from "@/types/database";

const mockClaimQueuedEmailRecipients = vi.fn();
const mockGetEmailSendQueueState = vi.fn();
const mockGetEmailSendForWorker = vi.fn();
const mockMarkEmailRecipientFailed = vi.fn();
const mockMarkEmailRecipientPrepared = vi.fn();
const mockMarkEmailRecipientReconciliationNeeded = vi.fn();
const mockMarkEmailRecipientSent = vi.fn();
const mockAppendEmailEvent = vi.fn();
const mockUpdateEmailSendCounts = vi.fn();
const mockCreateSystemContactEvent = vi.fn();

vi.mock("@/lib/data/email-sends", () => ({
  appendEmailEvent: mockAppendEmailEvent,
  claimQueuedEmailRecipients: mockClaimQueuedEmailRecipients,
  getEmailSendQueueState: mockGetEmailSendQueueState,
  getEmailSendForWorker: mockGetEmailSendForWorker,
  markEmailRecipientFailed: mockMarkEmailRecipientFailed,
  markEmailRecipientPrepared: mockMarkEmailRecipientPrepared,
  markEmailRecipientReconciliationNeeded: mockMarkEmailRecipientReconciliationNeeded,
  markEmailRecipientSent: mockMarkEmailRecipientSent,
  updateEmailSendCounts: mockUpdateEmailSendCounts,
}));

vi.mock("@/lib/data/contact-events", () => ({
  createSystemContactEvent: mockCreateSystemContactEvent,
}));

const { processEmailSendChunks } = await import("./send-pipeline");

function send(overrides: Partial<EmailSend> = {}): EmailSend {
  return {
    id: "send-1",
    kind: "outreach",
    status: "sending",
    name: "Outreach",
    subject_template: "Hello {{contact.name}}",
    preview_text: "Preview",
    from_email: "owner@example.com",
    from_name: "Behind The Mask",
    reply_to_email: "owner@example.com",
    template_version_id: null,
    builder_json_snapshot: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hi " },
            {
              type: "variable",
              attrs: { id: "contact.name", fallback: "there" },
            },
          ],
        },
      ],
    },
    html_preview_snapshot: "",
    text_preview_snapshot: "",
    created_by: "admin-1",
    updated_by: "admin-1",
    confirmed_by: "admin-1",
    confirmed_at: "2026-05-01T00:00:00.000Z",
    recipient_count: 1,
    skipped_count: 0,
    sent_count: 0,
    delivered_count: 0,
    opened_count: 0,
    clicked_count: 0,
    bounced_count: 0,
    complained_count: 0,
    failed_count: 0,
    unsubscribed_count: 0,
    metadata: {},
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function recipient(overrides: Partial<EmailSendRecipient> = {}): EmailSendRecipient {
  return {
    id: "recipient-1",
    send_id: "send-1",
    contact_id: "contact-1",
    email: "maya@example.com",
    contact_name_snapshot: "Maya",
    personalization_snapshot: {
      contact: { id: "contact-1", name: "Maya", email: "maya@example.com" },
    },
    status: "sending",
    skip_reason: null,
    rendered_subject: null,
    rendered_html: null,
    rendered_text: null,
    unsubscribe_token_hash: null,
    provider: null,
    provider_message_id: null,
    provider_metadata: {},
    send_attempts: 1,
    last_error: null,
    queued_at: "2026-05-01T00:00:00.000Z",
    sending_started_at: "2026-05-01T00:00:00.000Z",
    sent_at: null,
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    bounced_at: null,
    complained_at: null,
    unsubscribed_at: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
    ...overrides,
  };
}

function provider() {
  const sentInputs: ProviderSendEmailInput[] = [];
  const emailProvider: EmailProvider = {
    name: "fake",
    async sendEmail(input) {
      sentInputs.push(input);
      return {
        provider: "fake",
        providerMessageId: `message-${input.recipientId}`,
        raw: { accepted: true },
      };
    },
    parseWebhook() {
      return [];
    },
  };

  return { emailProvider, sentInputs };
}

describe("processEmailSendChunks", () => {
  beforeEach(() => {
    delete process.env.EMAIL_TEST_RECIPIENT_OVERRIDE;
    delete process.env.EMAIL_REQUIRE_REAL_PROVIDER;
    delete process.env.VERCEL_ENV;
    mockClaimQueuedEmailRecipients.mockReset();
    mockGetEmailSendQueueState.mockReset().mockResolvedValue({
      pending: 0,
      queued: 0,
      sending: 0,
    });
    mockGetEmailSendForWorker.mockReset().mockResolvedValue(send());
    mockMarkEmailRecipientFailed.mockReset();
    mockMarkEmailRecipientPrepared.mockReset();
    mockMarkEmailRecipientReconciliationNeeded.mockReset();
    mockMarkEmailRecipientSent.mockReset();
    mockAppendEmailEvent.mockReset();
    mockUpdateEmailSendCounts.mockReset();
    mockCreateSystemContactEvent.mockReset();
  });

  it("renders Maily JSON per recipient and stores rendered audit output", async () => {
    const { emailProvider, sentInputs } = provider();
    mockClaimQueuedEmailRecipients
      .mockResolvedValueOnce([recipient()])
      .mockResolvedValueOnce([]);

    await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 2,
    });

    expect(sentInputs[0]?.to).toBe("maya@example.com");
    expect(sentInputs[0]?.subject).toBe("Hello Maya");
    expect(sentInputs[0]?.html).toContain("Maya");
    expect(mockMarkEmailRecipientSent).toHaveBeenCalledWith(
      "recipient-1",
      expect.objectContaining({
        provider: "fake",
        providerMessageId: "message-recipient-1",
        renderedSubject: "Hello Maya",
        renderedHtml: expect.stringContaining("Maya"),
        renderedText: expect.stringContaining("Maya"),
      }),
    );
    expect(mockAppendEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        sendId: "send-1",
        recipientId: "recipient-1",
        type: "sent",
      }),
    );
    expect(mockUpdateEmailSendCounts).toHaveBeenCalledWith("send-1");
  });

  it("adds a contact timeline event after an email is accepted", async () => {
    const { emailProvider } = provider();
    mockClaimQueuedEmailRecipients
      .mockResolvedValueOnce([recipient()])
      .mockResolvedValueOnce([]);

    await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 2,
    });

    expect(mockCreateSystemContactEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        contactId: "contact-1",
        type: "custom",
        customLabel: "Email sent",
        authorId: "admin-1",
        authorName: "BTM Hub",
        body: "Subject: Hello Maya\nDelivery: Not delivered yet",
        metadata: expect.objectContaining({
          source: "email_sends",
          send_id: "send-1",
          recipient_id: "recipient-1",
          provider: "fake",
          provider_message_id: "message-recipient-1",
          delivery_status: "pending",
        }),
      }),
    );
  });

  it("reports when more recipients remain after the current worker run", async () => {
    const { emailProvider } = provider();
    mockClaimQueuedEmailRecipients.mockResolvedValueOnce([recipient()]);
    mockGetEmailSendQueueState.mockResolvedValue({
      pending: 0,
      queued: 1,
      sending: 0,
    });

    const result = await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 1,
    });

    expect(result).toEqual({ processed: 1, hasMore: true });
  });

  it("can override provider recipient address for test sends", async () => {
    process.env.EMAIL_TEST_RECIPIENT_OVERRIDE = "andrei@example.com";
    const { emailProvider, sentInputs } = provider();
    mockClaimQueuedEmailRecipients
      .mockResolvedValueOnce([recipient()])
      .mockResolvedValueOnce([]);

    await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 2,
    });

    expect(sentInputs[0]?.to).toBe("andrei@example.com");
  });

  it("rejects the test recipient override in real-provider mode", async () => {
    process.env.EMAIL_TEST_RECIPIENT_OVERRIDE = "andrei@example.com";
    process.env.EMAIL_REQUIRE_REAL_PROVIDER = "true";
    const { emailProvider } = provider();
    mockClaimQueuedEmailRecipients
      .mockResolvedValueOnce([recipient()])
      .mockResolvedValueOnce([]);

    await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 2,
    });

    expect(mockMarkEmailRecipientFailed).toHaveBeenCalledWith(
      "recipient-1",
      expect.stringContaining(
        "EMAIL_TEST_RECIPIENT_OVERRIDE is not allowed in production",
      ),
    );
  });

  it("provides owner variables at render time", async () => {
    const { emailProvider, sentInputs } = provider();
    mockGetEmailSendForWorker.mockResolvedValue(
      send({
        from_name: "BTM Owner",
        from_email: "owner@example.com",
        subject_template: "A note from {{owner.name}}",
        builder_json_snapshot: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Reply to " },
                {
                  type: "variable",
                  attrs: { id: "owner.email", fallback: "the owner" },
                },
              ],
            },
          ],
        },
      }),
    );
    mockClaimQueuedEmailRecipients
      .mockResolvedValueOnce([recipient()])
      .mockResolvedValueOnce([]);

    await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 2,
    });

    expect(sentInputs[0]?.subject).toBe("A note from BTM Owner");
    expect(sentInputs[0]?.text).toContain("owner@example.com");
  });

  it("does not request immediate continuation for non-stale sending rows", async () => {
    const { emailProvider } = provider();
    mockClaimQueuedEmailRecipients.mockResolvedValueOnce([]);
    mockGetEmailSendQueueState.mockResolvedValue({
      pending: 0,
      queued: 0,
      sending: 1,
    });

    const result = await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 1,
    });

    expect(result).toEqual({ processed: 0, hasMore: false });
  });

  it("keeps provider identifiers when the post-send audit write fails", async () => {
    const { emailProvider } = provider();
    mockClaimQueuedEmailRecipients
      .mockResolvedValueOnce([recipient()])
      .mockResolvedValueOnce([]);
    mockMarkEmailRecipientSent.mockRejectedValueOnce(new Error("database write failed"));

    await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 2,
    });

    expect(mockMarkEmailRecipientReconciliationNeeded).toHaveBeenCalledWith(
      "recipient-1",
      {
        provider: "fake",
        providerMessageId: "message-recipient-1",
        providerMetadata: {
          providerRecipientEmail: "maya@example.com",
          providerResponse: { accepted: true },
          testRecipientOverride: false,
        },
        message: "database write failed",
      },
    );
    expect(mockMarkEmailRecipientFailed).not.toHaveBeenCalled();
  });

  it("places broadcast unsubscribe footer inside the rendered HTML document", async () => {
    const { emailProvider, sentInputs } = provider();
    mockGetEmailSendForWorker.mockResolvedValue(
      send({
        kind: "broadcast",
        builder_json_snapshot: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "News" }],
            },
          ],
        },
      }),
    );
    mockClaimQueuedEmailRecipients
      .mockResolvedValueOnce([recipient()])
      .mockResolvedValueOnce([]);

    await processEmailSendChunks({
      sendId: "send-1",
      provider: emailProvider,
      chunkSize: 25,
      maxChunks: 2,
    });

    const html = sentInputs[0]?.html ?? "";
    expect(html).toContain("stop receiving all emails");
    expect(html.indexOf("stop receiving all emails")).toBeLessThan(
      html.toLowerCase().lastIndexOf("</body>"),
    );
    // RFC-8058 one-click headers accompany broadcasts.
    const headers = sentInputs[0]?.headers ?? {};
    expect(headers["List-Unsubscribe"]).toMatch(
      /^<http.*\/api\/email\/unsubscribe\/.+>$/,
    );
    expect(headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });
});
