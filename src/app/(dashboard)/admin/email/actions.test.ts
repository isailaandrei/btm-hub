import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetContacts = vi.fn();
const mockGetContactById = vi.fn();
const mockCreateEmailCampaign = vi.fn();
const mockGetEmailTemplateVersion = vi.fn();
const mockInsertEmailRecipients = vi.fn();
const mockListActiveEmailSuppressions = vi.fn();
const mockListContactEmailPreferences = vi.fn();
const mockListQueuedRecipients = vi.fn();
const mockQueueCampaignForSending = vi.fn();
const mockSuppressEmail = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGetEmailProvider = vi.fn();
const mockSendCampaignRecipients = vi.fn();

vi.mock("@/lib/data/contacts", () => ({
  getContacts: mockGetContacts,
  getContactById: mockGetContactById,
}));

vi.mock("@/lib/data/email-campaigns", () => ({
  createEmailCampaign: mockCreateEmailCampaign,
  insertEmailRecipients: mockInsertEmailRecipients,
  listQueuedRecipients: mockListQueuedRecipients,
  listActiveEmailSuppressions: mockListActiveEmailSuppressions,
  listContactEmailPreferences: mockListContactEmailPreferences,
  queueCampaignForSending: mockQueueCampaignForSending,
  suppressEmail: mockSuppressEmail,
}));

vi.mock("@/lib/data/email-templates", () => ({
  getEmailTemplateVersion: mockGetEmailTemplateVersion,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/email/provider", () => ({
  getEmailProvider: mockGetEmailProvider,
}));

vi.mock("@/lib/email/send-pipeline", () => ({
  sendCampaignRecipients: mockSendCampaignRecipients,
}));

const {
  confirmCampaignSendAction,
  createCampaignDraftAction,
  previewCampaignAction,
  suppressContactEmailAction,
} = await import("./actions");

const CONTACT_ONE = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  email: "one@example.com",
  name: "One",
};

const CONTACT_TWO = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  email: "two@example.com",
  name: "Two",
};

const TEMPLATE_VERSION_ID = "550e8400-e29b-41d4-a716-446655440010";

describe("previewCampaignAction", () => {
  beforeEach(() => {
    mockGetContacts.mockReset().mockResolvedValue([CONTACT_ONE, CONTACT_TWO]);
    mockGetContactById.mockReset().mockResolvedValue(CONTACT_ONE);
    mockListActiveEmailSuppressions.mockReset().mockResolvedValue([]);
    mockListContactEmailPreferences.mockReset().mockResolvedValue([]);
  });

  it("rejects broadcast preview without a subject", async () => {
    await expect(
      previewCampaignAction({
        kind: "broadcast",
        subject: " ",
        templateVersionId: TEMPLATE_VERSION_ID,
      }),
    ).rejects.toThrow("Subject is required");
  });

  it("returns skipped newsletter-unsubscribed contacts for broadcast", async () => {
    mockListContactEmailPreferences.mockResolvedValue([
      {
        contact_id: CONTACT_TWO.id,
        newsletter_unsubscribed_at: "2026-04-28T00:00:00.000Z",
      },
    ]);

    const result = await previewCampaignAction({
      kind: "broadcast",
      subject: "Newsletter",
      templateVersionId: TEMPLATE_VERSION_ID,
    });

    expect(result.eligibleCount).toBe(1);
    expect(result.skipped).toEqual([
      {
        contactId: CONTACT_TWO.id,
        email: "two@example.com",
        name: "Two",
        reason: "newsletter_unsubscribed",
      },
    ]);
  });

  it("allows newsletter-unsubscribed contacts for outreach", async () => {
    mockListContactEmailPreferences.mockResolvedValue([
      {
        contact_id: CONTACT_TWO.id,
        newsletter_unsubscribed_at: "2026-04-28T00:00:00.000Z",
      },
    ]);

    const result = await previewCampaignAction({
      kind: "outreach",
      contactIds: [CONTACT_TWO.id],
      subject: "Personal note",
      templateVersionId: TEMPLATE_VERSION_ID,
    });

    expect(result.eligibleCount).toBe(1);
    expect(result.skipped).toEqual([]);
  });

  it("rejects one-off send preview when the contact is globally suppressed", async () => {
    mockListActiveEmailSuppressions.mockResolvedValue([
      { contact_id: CONTACT_ONE.id, email: CONTACT_ONE.email },
    ]);

    const result = await previewCampaignAction({
      kind: "one_off",
      oneOffContactId: CONTACT_ONE.id,
      subject: "Hello",
      templateVersionId: TEMPLATE_VERSION_ID,
    });

    expect(result.eligibleCount).toBe(0);
    expect(result.skipped).toEqual([
      {
        contactId: CONTACT_ONE.id,
        email: "one@example.com",
        name: "One",
        reason: "suppressed",
      },
    ]);
  });
});

describe("createCampaignDraftAction", () => {
  beforeEach(() => {
    mockGetContacts.mockReset().mockResolvedValue([CONTACT_ONE]);
    mockGetEmailTemplateVersion.mockReset().mockResolvedValue({
      id: TEMPLATE_VERSION_ID,
      html: "<p>Hello</p>",
      text: "Hello",
      preview_text: "Preview",
    });
    mockListActiveEmailSuppressions.mockReset().mockResolvedValue([]);
    mockListContactEmailPreferences.mockReset().mockResolvedValue([]);
    mockCreateEmailCampaign.mockReset().mockResolvedValue({ id: "campaign-1" });
    mockInsertEmailRecipients.mockReset().mockResolvedValue([]);
  });

  it("creates campaign draft and recipient rows from preview eligibility", async () => {
    const result = await createCampaignDraftAction({
      kind: "broadcast",
      name: "Newsletter",
      subject: "Hello",
      templateVersionId: TEMPLATE_VERSION_ID,
    });

    expect(mockCreateEmailCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "broadcast",
        name: "Newsletter",
        subject: "Hello",
        htmlSnapshot: "<p>Hello</p>",
        textSnapshot: "Hello",
      }),
    );
    expect(mockInsertEmailRecipients).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      recipients: [
        {
          contactId: CONTACT_ONE.id,
          email: "one@example.com",
          name: "One",
          personalization: {
            contact: {
              id: CONTACT_ONE.id,
              name: "One",
              email: "one@example.com",
            },
          },
        },
      ],
    });
    expect(result).toEqual({ campaignId: "campaign-1" });
  });
});

describe("confirmCampaignSendAction", () => {
  beforeEach(() => {
    mockGetEmailProvider.mockReset().mockReturnValue({ name: "fake" });
    mockQueueCampaignForSending.mockReset().mockResolvedValue({
      id: "550e8400-e29b-41d4-a716-446655440020",
    });
    mockListQueuedRecipients.mockReset().mockResolvedValue([{ id: "recipient-1" }]);
    mockSendCampaignRecipients.mockReset().mockResolvedValue(undefined);
    mockRevalidatePath.mockReset();
  });

  it("queues the campaign and passes queued recipients to the send pipeline", async () => {
    const campaignId = "550e8400-e29b-41d4-a716-446655440020";

    await expect(confirmCampaignSendAction(campaignId)).resolves.toEqual({ ok: true });

    expect(mockQueueCampaignForSending).toHaveBeenCalledWith(campaignId);
    expect(mockListQueuedRecipients).toHaveBeenCalledWith(campaignId);
    expect(mockSendCampaignRecipients).toHaveBeenCalledWith({
      provider: { name: "fake" },
      campaign: { id: campaignId },
      recipients: [{ id: "recipient-1" }],
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
  });
});

describe("suppressContactEmailAction", () => {
  beforeEach(() => {
    mockSuppressEmail.mockReset().mockResolvedValue(undefined);
    mockRevalidatePath.mockReset();
  });

  it("suppresses a contact email and revalidates admin views", async () => {
    await suppressContactEmailAction({
      contactId: CONTACT_ONE.id,
      email: " One@Example.com ",
      reason: "manual",
      detail: "Owner request",
    });

    expect(mockSuppressEmail).toHaveBeenCalledWith({
      contactId: CONTACT_ONE.id,
      email: "One@Example.com",
      reason: "manual",
      detail: "Owner request",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/contacts/${CONTACT_ONE.id}`);
  });
});
