import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetContacts = vi.fn();
const mockCreateEmailSendWithRecipients = vi.fn();
const mockListEmailSendRecipients = vi.fn();
const mockListActiveEmailSuppressions = vi.fn();
const mockListContactEmailPreferences = vi.fn();
const mockDeleteRemovableEmailSend = vi.fn();
const mockQueueEmailSend = vi.fn();
const mockGetEmailTemplateVersion = vi.fn();
const mockRenderMailyDocument = vi.fn();
const mockAssertMailyDocument = vi.fn((document: unknown) => document);
const mockGetEmailProvider = vi.fn();
const mockProcessEmailSendChunks = vi.fn();
const mockTriggerEmailWorker = vi.fn();
const mockAfter = vi.fn();
const mockRequireAdmin = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/data/contacts", () => ({
  getContacts: mockGetContacts,
}));

vi.mock("@/lib/data/email-sends", () => ({
  createEmailSendWithRecipients: mockCreateEmailSendWithRecipients,
  deleteRemovableEmailSend: mockDeleteRemovableEmailSend,
  listEmailSendRecipients: mockListEmailSendRecipients,
  listActiveEmailSuppressions: mockListActiveEmailSuppressions,
  listContactEmailPreferences: mockListContactEmailPreferences,
  queueEmailSend: mockQueueEmailSend,
}));

vi.mock("@/lib/data/email-templates", () => ({
  getEmailTemplateVersion: mockGetEmailTemplateVersion,
}));

vi.mock("@/lib/email/rendering/maily", () => ({
  assertMailyDocument: mockAssertMailyDocument,
  renderMailyDocument: mockRenderMailyDocument,
}));

vi.mock("@/lib/email/provider", () => ({
  getEmailProvider: mockGetEmailProvider,
}));

vi.mock("@/lib/email/send-pipeline", () => ({
  processEmailSendChunks: mockProcessEmailSendChunks,
}));

vi.mock("@/lib/email/worker-trigger", () => ({
  triggerEmailWorker: mockTriggerEmailWorker,
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("next/server", () => ({
  after: mockAfter,
}));

const {
  createEmailDraftAction,
  getEmailSendDiagnosticsAction,
  previewEmailAction,
  sendEmailNowAction,
} = await import("./actions");

const CONTACT_ONE = {
  id: "550e8400-e29b-41d4-a716-446655440001",
  email: "one@example.com",
  name: "One",
  phone: null,
  profile_id: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

const CONTACT_TWO = {
  id: "550e8400-e29b-41d4-a716-446655440002",
  email: "two@example.com",
  name: "Two",
  phone: null,
  profile_id: null,
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

const TEMPLATE_VERSION_ID = "550e8400-e29b-41d4-a716-446655440010";

beforeEach(() => {
  delete process.env.EMAIL_FROM_EMAIL;
  delete process.env.EMAIL_FROM_NAME;
  delete process.env.EMAIL_REPLY_TO_EMAIL;
  mockGetContacts.mockReset().mockResolvedValue([CONTACT_ONE, CONTACT_TWO]);
  mockListActiveEmailSuppressions.mockReset().mockResolvedValue([]);
  mockListContactEmailPreferences.mockReset().mockResolvedValue([]);
  mockGetEmailTemplateVersion.mockReset().mockResolvedValue({
    id: TEMPLATE_VERSION_ID,
    preview_text: "Preview",
    builder_json: { type: "doc", content: [] },
  });
  mockRenderMailyDocument.mockReset().mockResolvedValue({
    html: "<p>Hello {{contact.name}}</p>",
    text: "Hello {{contact.name}}",
  });
  mockCreateEmailSendWithRecipients.mockReset().mockResolvedValue({
    id: "send-1",
  });
  mockListEmailSendRecipients.mockReset().mockResolvedValue([]);
  mockDeleteRemovableEmailSend.mockReset().mockResolvedValue(true);
  mockQueueEmailSend.mockReset().mockResolvedValue({ id: "send-1" });
  mockGetEmailProvider.mockReset().mockReturnValue({ name: "fake" });
  mockProcessEmailSendChunks.mockReset().mockResolvedValue({
    processed: 1,
    hasMore: false,
  });
  mockTriggerEmailWorker.mockReset();
  mockAfter.mockReset();
  mockRequireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
  mockRevalidatePath.mockReset();
});

describe("previewEmailAction", () => {
  it("previews selected outreach recipients and skipped suppressions", async () => {
    mockListActiveEmailSuppressions.mockResolvedValue([
      {
        contact_id: CONTACT_TWO.id,
        email: CONTACT_TWO.email,
        lifted_at: null,
      },
    ]);

    const result = await previewEmailAction({
      kind: "outreach",
      contactIds: [CONTACT_ONE.id, CONTACT_TWO.id],
      subject: "Hello",
      templateVersionId: TEMPLATE_VERSION_ID,
    });

    expect(result.eligibleCount).toBe(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        contactId: CONTACT_TWO.id,
        reason: "suppressed",
      }),
    ]);
    expect(mockRequireAdmin).toHaveBeenCalled();
  });
});

describe("createEmailDraftAction", () => {
  it("creates a draft send with eligible and skipped recipient rows", async () => {
    mockListContactEmailPreferences.mockResolvedValue([
      {
        contact_id: CONTACT_TWO.id,
        newsletter_unsubscribed_at: "2026-05-01T00:00:00.000Z",
      },
    ]);

    const result = await createEmailDraftAction({
      kind: "broadcast",
      subject: "Hello {{contact.name}}",
      templateVersionId: TEMPLATE_VERSION_ID,
      builderJson: { type: "doc", content: [] },
    });

    expect(mockCreateEmailSendWithRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "broadcast",
        name: "Hello {{contact.name}}",
        subjectTemplate: "Hello {{contact.name}}",
        builderJsonSnapshot: { type: "doc", content: [] },
        recipients: [
          expect.objectContaining({
            contactId: CONTACT_ONE.id,
            status: "pending",
          }),
          expect.objectContaining({
            contactId: CONTACT_TWO.id,
            status: "skipped_unsubscribed",
            skipReason: "newsletter_unsubscribed",
          }),
        ],
      }),
    );
    expect(result).toEqual({ sendId: "send-1" });
  });
});

describe("sendEmailNowAction", () => {
  it("creates and queues an email send in one action", async () => {
    const result = await sendEmailNowAction({
      kind: "outreach",
      subject: "Hello {{contact.name}}",
      templateVersionId: TEMPLATE_VERSION_ID,
      builderJson: { type: "doc", content: [] },
      contactIds: [CONTACT_ONE.id],
    });

    expect(mockCreateEmailSendWithRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "outreach",
        subjectTemplate: "Hello {{contact.name}}",
      }),
    );
    expect(mockQueueEmailSend).toHaveBeenCalledWith("send-1");
    expect(mockAfter).toHaveBeenCalled();
    expect(result).toEqual({ sendId: "send-1" });
  });
});

describe("getEmailSendDiagnosticsAction", () => {
  it("returns recipient statuses and provider errors for troubleshooting", async () => {
    const sendId = "550e8400-e29b-41d4-a716-446655440020";
    mockListEmailSendRecipients.mockResolvedValue([
      {
        id: "recipient-1",
        email: "test@example.com",
        contact_name_snapshot: "Test Contact",
        status: "failed",
        skip_reason: null,
        provider: "brevo",
        provider_message_id: null,
        provider_metadata: {
          providerRecipientEmail: "isailaandrei.i@gmail.com",
          testRecipientOverride: true,
        },
        send_attempts: 3,
        last_error: "Brevo send failed: sender not verified",
        sent_at: "2026-05-01T00:00:00.000Z",
        delivered_at: null,
        clicked_at: "2026-05-01T00:03:00.000Z",
        bounced_at: null,
        complained_at: null,
        unsubscribed_at: null,
        updated_at: "2026-05-01T00:00:00.000Z",
      },
    ]);

    const result = await getEmailSendDiagnosticsAction(sendId);

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockListEmailSendRecipients).toHaveBeenCalledWith(sendId);
    expect(result.recipients).toEqual([
      {
        id: "recipient-1",
        email: "test@example.com",
        name: "Test Contact",
        status: "failed",
        skipReason: null,
        provider: "brevo",
        providerMessageId: null,
        providerRecipientEmail: "isailaandrei.i@gmail.com",
        testRecipientOverride: true,
        attempts: 3,
        lastError: "Brevo send failed: sender not verified",
        sentAt: "2026-05-01T00:00:00.000Z",
        deliveredAt: null,
        clickedAt: "2026-05-01T00:03:00.000Z",
        bouncedAt: null,
        complainedAt: null,
        unsubscribedAt: null,
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
    ]);
  });
});
