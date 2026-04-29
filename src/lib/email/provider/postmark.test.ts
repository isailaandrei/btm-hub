import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmailProvider } from "./index";
import { createPostmarkEmailProvider, normalizePostmarkWebhook } from "./postmark";

const { mockSendEmailBatch } = vi.hoisted(() => ({
  mockSendEmailBatch: vi.fn(),
}));

vi.mock("postmark", () => ({
  Models: {
    LinkTrackingOptions: {
      HtmlAndText: "HtmlAndText",
    },
  },
  ServerClient: vi.fn().mockImplementation(function ServerClient() {
    return {
      sendEmailBatch: mockSendEmailBatch,
    };
  }),
}));

function restoreEnv(name: string, value: string | undefined) {
  if (value == null) delete process.env[name];
  else process.env[name] = value;
}

describe("postmark email provider", () => {
  beforeEach(() => {
    mockSendEmailBatch.mockReset();
  });

  it("normalizes delivery webhooks", async () => {
    await expect(
      normalizePostmarkWebhook({
        RecordType: "Delivery",
        MessageID: "msg-1",
        Recipient: "person@example.com",
        DeliveredAt: "2026-04-28T12:00:00.000Z",
        Details: "250 OK",
      }),
    ).resolves.toEqual({
      kind: "event",
      event: {
        type: "delivered",
        provider: "postmark",
        providerEventId: "Delivery:msg-1:2026-04-28T12:00:00.000Z",
        providerMessageId: "msg-1",
        occurredAt: "2026-04-28T12:00:00.000Z",
        payload: {
          RecordType: "Delivery",
          MessageID: "msg-1",
          Recipient: "person@example.com",
          DeliveredAt: "2026-04-28T12:00:00.000Z",
          Details: "250 OK",
        },
      },
    });
  });

  it("normalizes bounce webhooks", async () => {
    await expect(
      normalizePostmarkWebhook({
        RecordType: "Bounce",
        ID: 42,
        Type: "HardBounce",
        MessageID: "msg-2",
        Email: "person@example.com",
        BouncedAt: "2026-04-28T12:01:00.000Z",
      }),
    ).resolves.toMatchObject({
      kind: "event",
      event: {
        type: "bounced",
        provider: "postmark",
        providerEventId: "42",
        providerMessageId: "msg-2",
        occurredAt: "2026-04-28T12:01:00.000Z",
      },
    });
  });

  it("normalizes open and click webhooks", async () => {
    await expect(
      normalizePostmarkWebhook({
        RecordType: "Open",
        MessageID: "msg-3",
        Recipient: "person@example.com",
        ReceivedAt: "2026-04-28T12:02:00.000Z",
      }),
    ).resolves.toMatchObject({
      kind: "event",
      event: {
        type: "opened",
        providerEventId: "Open:msg-3:2026-04-28T12:02:00.000Z",
        providerMessageId: "msg-3",
        occurredAt: "2026-04-28T12:02:00.000Z",
      },
    });

    await expect(
      normalizePostmarkWebhook({
        RecordType: "Click",
        MessageID: "msg-4",
        Recipient: "person@example.com",
        OriginalLink: "https://behind-the-mask.com/coral",
        ReceivedAt: "2026-04-28T12:03:00.000Z",
      }),
    ).resolves.toMatchObject({
      kind: "event",
      event: {
        type: "clicked",
        providerEventId:
          "Click:msg-4:2026-04-28T12:03:00.000Z:https://behind-the-mask.com/coral",
        providerMessageId: "msg-4",
        occurredAt: "2026-04-28T12:03:00.000Z",
      },
    });
  });

  it("normalizes spam complaint webhooks", async () => {
    await expect(
      normalizePostmarkWebhook({
        RecordType: "SpamComplaint",
        ID: 43,
        Type: "SpamComplaint",
        MessageID: "msg-5",
        Email: "person@example.com",
        BouncedAt: "2026-04-28T12:04:00.000Z",
      }),
    ).resolves.toMatchObject({
      kind: "event",
      event: {
        type: "complained",
        providerEventId: "43",
        providerMessageId: "msg-5",
        occurredAt: "2026-04-28T12:04:00.000Z",
      },
    });
  });

  it("normalizes inbound reply webhooks", async () => {
    await expect(
      normalizePostmarkWebhook({
        MessageStream: "inbound",
        From: "aleksandra@example.com",
        To: '"BTM" <r-11111111-1111-1111-1111-111111111111@replies.behind-the-mask.com>',
        OriginalRecipient:
          "r-11111111-1111-1111-1111-111111111111@replies.behind-the-mask.com",
        Subject: "Re: Coral internship",
        MessageID: "inbound-1",
        Date: "2026-04-28T12:05:00.000Z",
        TextBody: "Thanks for sending this.",
        HtmlBody: "<p>Thanks for sending this.</p>",
        StrippedTextReply: "Thanks for sending this.",
        Attachments: [
          {
            Name: "cv.pdf",
            ContentType: "application/pdf",
            ContentLength: 1200,
          },
        ],
      }),
    ).resolves.toEqual({
      kind: "reply",
      reply: {
        provider: "postmark",
        providerEventId: "inbound-1",
        providerMessageId: "inbound-1",
        inboundTo:
          "r-11111111-1111-1111-1111-111111111111@replies.behind-the-mask.com",
        inboundFrom: "aleksandra@example.com",
        subject: "Re: Coral internship",
        textBody: "Thanks for sending this.",
        htmlBody: "<p>Thanks for sending this.</p>",
        attachmentMetadata: [
          {
            name: "cv.pdf",
            contentType: "application/pdf",
            contentLength: 1200,
          },
        ],
        receivedAt: "2026-04-28T12:05:00.000Z",
        payload: {
          MessageStream: "inbound",
          From: "aleksandra@example.com",
          To: '"BTM" <r-11111111-1111-1111-1111-111111111111@replies.behind-the-mask.com>',
          OriginalRecipient:
            "r-11111111-1111-1111-1111-111111111111@replies.behind-the-mask.com",
          Subject: "Re: Coral internship",
          MessageID: "inbound-1",
          Date: "2026-04-28T12:05:00.000Z",
          TextBody: "Thanks for sending this.",
          HtmlBody: "<p>Thanks for sending this.</p>",
          StrippedTextReply: "Thanks for sending this.",
          Attachments: [
            {
              Name: "cv.pdf",
              ContentType: "application/pdf",
              ContentLength: 1200,
            },
          ],
        },
      },
    });
  });

  it("validates the configured webhook token header", async () => {
    const previousToken = process.env.POSTMARK_WEBHOOK_TOKEN;
    process.env.POSTMARK_WEBHOOK_TOKEN = "secret-token";

    const provider = createPostmarkEmailProvider();
    await expect(
      provider.verifyWebhookSignature(
        "",
        new Headers({ "x-postmark-webhook-token": "secret-token" }),
      ),
    ).resolves.toBe(true);
    await expect(
      provider.verifyWebhookSignature(
        "",
        new Headers({ "x-postmark-webhook-token": "wrong" }),
      ),
    ).resolves.toBe(false);

    restoreEnv("POSTMARK_WEBHOOK_TOKEN", previousToken);
  });

  it("rejects webhooks when no verification credentials are configured", async () => {
    const previousToken = process.env.POSTMARK_WEBHOOK_TOKEN;
    const previousUser = process.env.POSTMARK_WEBHOOK_BASIC_AUTH_USER;
    const previousPassword = process.env.POSTMARK_WEBHOOK_BASIC_AUTH_PASSWORD;
    delete process.env.POSTMARK_WEBHOOK_TOKEN;
    delete process.env.POSTMARK_WEBHOOK_BASIC_AUTH_USER;
    delete process.env.POSTMARK_WEBHOOK_BASIC_AUTH_PASSWORD;

    const provider = createPostmarkEmailProvider();
    await expect(
      provider.verifyWebhookSignature("", new Headers()),
    ).resolves.toBe(false);

    restoreEnv("POSTMARK_WEBHOOK_TOKEN", previousToken);
    restoreEnv("POSTMARK_WEBHOOK_BASIC_AUTH_USER", previousUser);
    restoreEnv("POSTMARK_WEBHOOK_BASIC_AUTH_PASSWORD", previousPassword);
  });

  it("sends Postmark batches with the SDK batch API", async () => {
    const previousToken = process.env.POSTMARK_SERVER_TOKEN;
    process.env.POSTMARK_SERVER_TOKEN = "server-token";
    mockSendEmailBatch.mockResolvedValue([
      {
        MessageID: "message-1",
        SubmittedAt: "2026-04-28T12:00:00.000Z",
      },
      {
        MessageID: "message-2",
        SubmittedAt: "2026-04-28T12:00:01.000Z",
      },
    ]);

    const provider = createPostmarkEmailProvider();
    const result = await provider.sendBatch([
      {
        recipientId: "recipient-1",
        to: "one@example.com",
        from: "BTM <hello@mail.behind-the-mask.com>",
        replyTo: "r-recipient-1@replies.behind-the-mask.com",
        subject: "Hello",
        html: "<p>Hello</p>",
        text: "Hello",
        metadata: { campaignKind: "broadcast" },
      },
      {
        recipientId: "recipient-2",
        to: "two@example.com",
        from: "BTM <hello@mail.behind-the-mask.com>",
        replyTo: "r-recipient-2@replies.behind-the-mask.com",
        subject: "Hi",
        html: "<p>Hi</p>",
        text: "Hi",
        metadata: { campaignKind: "outreach" },
      },
    ]);

    expect(mockSendEmailBatch).toHaveBeenCalledTimes(1);
    expect(mockSendEmailBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        To: "one@example.com",
        MessageStream: "broadcast",
      }),
      expect.objectContaining({
        To: "two@example.com",
        MessageStream: "outbound",
      }),
    ]);
    expect(result.map((item) => item.providerMessageId)).toEqual([
      "message-1",
      "message-2",
    ]);

    restoreEnv("POSTMARK_SERVER_TOKEN", previousToken);
  });

  it("is selected by the provider factory", () => {
    const previousProvider = process.env.EMAIL_PROVIDER;
    process.env.EMAIL_PROVIDER = "postmark";

    expect(getEmailProvider().name).toBe("postmark");

    restoreEnv("EMAIL_PROVIDER", previousProvider);
  });
});
