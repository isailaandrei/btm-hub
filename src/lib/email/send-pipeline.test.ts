import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EmailProvider, ProviderSendEmailInput } from "./provider/types";
import type { EmailCampaign, EmailCampaignRecipient } from "@/types/database";

const mockAppendEmailEvent = vi.fn();
const mockMarkRecipientFailed = vi.fn();
const mockMarkRecipientSent = vi.fn();
const mockUpdateCampaignSendCounts = vi.fn();

vi.mock("@/lib/data/email-campaigns", () => ({
  appendEmailEvent: mockAppendEmailEvent,
  markRecipientFailed: mockMarkRecipientFailed,
  markRecipientSent: mockMarkRecipientSent,
  updateCampaignSendCounts: mockUpdateCampaignSendCounts,
}));

const { sendCampaignRecipients } = await import("./send-pipeline");

function campaign(overrides: Partial<EmailCampaign> = {}): EmailCampaign {
  return {
    id: "campaign-1",
    kind: "broadcast",
    status: "sending",
    name: "Newsletter",
    subject: "Hello",
    preview_text: "",
    from_email: "hello@mail.behind-the-mask.com",
    from_name: "Behind The Mask",
    reply_to_email: "reply@replies.behind-the-mask.com",
    template_version_id: null,
    html_snapshot: "<p>Hello</p>",
    text_snapshot: "Hello",
    mjml_snapshot: "",
    created_by: "admin-1",
    updated_by: "admin-1",
    confirmed_by: "admin-1",
    confirmed_at: "2026-04-28T00:00:00.000Z",
    recipient_count: 1,
    sent_count: 0,
    delivered_count: 0,
    opened_count: 0,
    clicked_count: 0,
    bounced_count: 0,
    complained_count: 0,
    replied_count: 0,
    failed_count: 0,
    metadata: {},
    created_at: "2026-04-28T00:00:00.000Z",
    updated_at: "2026-04-28T00:00:00.000Z",
    ...overrides,
  };
}

function recipient(
  id: string,
  status: EmailCampaignRecipient["status"] = "queued",
): EmailCampaignRecipient {
  return {
    id,
    campaign_id: "campaign-1",
    contact_id: "contact-1",
    email: `${id}@example.com`,
    contact_name_snapshot: id,
    personalization_snapshot: {},
    status,
    provider: null,
    provider_message_id: null,
    provider_metadata: {},
    last_error: null,
    queued_at: "2026-04-28T00:00:00.000Z",
    sent_at: null,
    delivered_at: null,
    opened_at: null,
    clicked_at: null,
    bounced_at: null,
    complained_at: null,
    replied_at: null,
    created_at: "2026-04-28T00:00:00.000Z",
    updated_at: "2026-04-28T00:00:00.000Z",
  };
}

function provider(overrides: Partial<EmailProvider> = {}) {
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
    async sendBatch() {
      return [];
    },
    async parseWebhook() {
      throw new Error("unused");
    },
    async verifyWebhookSignature() {
      return true;
    },
    async forwardInboundReply() {
      throw new Error("unused");
    },
    ...overrides,
  };

  return { emailProvider, sentInputs };
}

describe("sendCampaignRecipients", () => {
  beforeEach(() => {
    mockAppendEmailEvent.mockReset();
    mockMarkRecipientFailed.mockReset();
    mockMarkRecipientSent.mockReset();
    mockUpdateCampaignSendCounts.mockReset();
  });

  it("creates sent events and provider ids for each queued recipient", async () => {
    const { emailProvider } = provider();

    await sendCampaignRecipients({
      provider: emailProvider,
      campaign: campaign(),
      recipients: [recipient("recipient-1")],
    });

    expect(mockMarkRecipientSent).toHaveBeenCalledWith("recipient-1", {
      provider: "fake",
      providerMessageId: "message-recipient-1",
      providerMetadata: { accepted: true },
    });
    expect(mockAppendEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "recipient-1",
        type: "sent",
        providerMessageId: "message-recipient-1",
      }),
    );
    expect(mockUpdateCampaignSendCounts).toHaveBeenCalledWith("campaign-1");
  });

  it("marks one failed recipient without failing the whole campaign", async () => {
    const { emailProvider } = provider({
      async sendEmail(input) {
        if (input.recipientId === "recipient-1") throw new Error("provider down");
        return {
          provider: "fake",
          providerMessageId: `message-${input.recipientId}`,
          raw: { accepted: true },
        };
      },
    });

    await sendCampaignRecipients({
      provider: emailProvider,
      campaign: campaign(),
      recipients: [recipient("recipient-1"), recipient("recipient-2")],
    });

    expect(mockMarkRecipientFailed).toHaveBeenCalledWith(
      "recipient-1",
      "provider down",
    );
    expect(mockMarkRecipientSent).toHaveBeenCalledWith(
      "recipient-2",
      expect.any(Object),
    );
  });

  it("does not send skipped recipients", async () => {
    const { emailProvider, sentInputs } = provider();

    await sendCampaignRecipients({
      provider: emailProvider,
      campaign: campaign(),
      recipients: [recipient("recipient-1", "skipped_suppressed")],
    });

    expect(sentInputs).toEqual([]);
    expect(mockMarkRecipientSent).not.toHaveBeenCalled();
  });

  it("uses reply-to addresses on the replies subdomain", async () => {
    const { emailProvider, sentInputs } = provider();

    await sendCampaignRecipients({
      provider: emailProvider,
      campaign: campaign(),
      recipients: [recipient("recipient-1")],
    });

    expect(sentInputs[0]?.replyTo).toBe(
      "r-recipient-1@replies.behind-the-mask.com",
    );
  });

  it("passes campaign kind through provider metadata", async () => {
    const { emailProvider, sentInputs } = provider();

    await sendCampaignRecipients({
      provider: emailProvider,
      campaign: campaign({ kind: "outreach" }),
      recipients: [recipient("recipient-1")],
    });

    expect(sentInputs[0]?.metadata.campaignKind).toBe("outreach");
  });

  it("renders campaign MJML separately for each recipient personalization snapshot", async () => {
    const { emailProvider, sentInputs } = provider();

    await sendCampaignRecipients({
      provider: emailProvider,
      campaign: campaign({
        subject: "Hello {{contact.name}}",
        html_snapshot: "<p>Hello Alex</p>",
        text_snapshot: "Hello Alex",
        mjml_snapshot:
          "<mjml><mj-body><mj-section><mj-column><mj-text>Hello {{contact.name}} at {{contact.email}}</mj-text></mj-column></mj-section></mj-body></mjml>",
      }),
      recipients: [
        {
          ...recipient("recipient-1"),
          email: "maria@example.com",
          contact_name_snapshot: "Maria",
          personalization_snapshot: {
            contact: {
              id: "contact-1",
              name: "Maria",
              email: "maria@example.com",
            },
          },
        },
      ],
    });

    expect(sentInputs[0]?.subject).toBe("Hello Maria");
    expect(sentInputs[0]?.html).toContain("Hello Maria at maria@example.com");
    expect(sentInputs[0]?.text).toContain("Hello Maria at maria@example.com");
  });
});
