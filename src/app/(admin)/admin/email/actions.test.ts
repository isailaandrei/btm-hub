import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetContacts = vi.fn();
const mockCreateEmailSendWithRecipients = vi.fn();
const mockListEmailEventsForSend = vi.fn();
const mockListEmailSendRecipients = vi.fn();
const mockListEmailSends = vi.fn();
const mockListEmailManualRecipients = vi.fn();
const mockGetEmailManualRecipientsByIds = vi.fn();
const mockUpsertEmailManualRecipient = vi.fn();
const mockListActiveEmailSuppressions = vi.fn();
const mockListContactEmailPreferences = vi.fn();
const mockDeleteRemovableEmailSend = vi.fn();
const mockQueueEmailSend = vi.fn();
const mockGetEmailTemplateVersion = vi.fn();
const mockListEmailTemplates = vi.fn();
const mockFindOrCreateTemplateForDocument = vi.fn();
const mockRenderMailyDocument = vi.fn();
const mockRenderMailyEmail = vi.fn();
const mockAssertMailyDocument = vi.fn((document: unknown) => document);
const mockGetEmailProvider = vi.fn();
const mockGetEmailWorkerSecret = vi.fn();
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
  listEmailEventsForSend: mockListEmailEventsForSend,
  listEmailSendRecipients: mockListEmailSendRecipients,
  listEmailSends: mockListEmailSends,
  listActiveEmailSuppressions: mockListActiveEmailSuppressions,
  listContactEmailPreferences: mockListContactEmailPreferences,
  queueEmailSend: mockQueueEmailSend,
}));

vi.mock("@/lib/data/email-manual-recipients", () => ({
  getEmailManualRecipientsByIds: mockGetEmailManualRecipientsByIds,
  listEmailManualRecipients: mockListEmailManualRecipients,
  upsertEmailManualRecipient: mockUpsertEmailManualRecipient,
}));

vi.mock("@/lib/data/email-templates", () => ({
  getEmailTemplateVersion: mockGetEmailTemplateVersion,
  listEmailTemplates: mockListEmailTemplates,
}));

vi.mock("@/lib/email/template-authoring", () => ({
  findOrCreateTemplateForDocument: mockFindOrCreateTemplateForDocument,
}));

vi.mock("@/lib/email/rendering/maily", () => ({
  assertMailyDocument: mockAssertMailyDocument,
  renderMailyDocument: mockRenderMailyDocument,
  renderMailyEmail: mockRenderMailyEmail,
}));

vi.mock("@/lib/email/provider", () => ({
  getEmailProvider: mockGetEmailProvider,
}));

vi.mock("@/lib/email/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/email/settings")>()),
  getEmailWorkerSecret: mockGetEmailWorkerSecret,
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
  loadEmailManualRecipientsAction,
  loadEmailSendsAction,
  loadEmailStudioDataAction,
  loadEmailTemplatesAction,
  getComposeRecipientsAction,
  previewEmailAction,
  renderComposePreviewAction,
  saveEmailManualRecipientAction,
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
const MANUAL_RECIPIENT = {
  id: "550e8400-e29b-41d4-a716-446655440030",
  email: "friend@example.com",
  name: "Future Applicant",
  notes: "",
  created_by: "admin-1",
  updated_by: "admin-1",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
};

beforeEach(() => {
  delete process.env.EMAIL_FROM_EMAIL;
  delete process.env.EMAIL_FROM_NAME;
  delete process.env.EMAIL_REPLY_TO_EMAIL;
  mockGetContacts.mockReset().mockResolvedValue([CONTACT_ONE, CONTACT_TWO]);
  mockListActiveEmailSuppressions.mockReset().mockResolvedValue([]);
  mockListContactEmailPreferences.mockReset().mockResolvedValue([]);
  mockGetEmailTemplateVersion.mockReset().mockResolvedValue({
    id: TEMPLATE_VERSION_ID,
    builder_json: { type: "doc", content: [] },
  });
  mockRenderMailyDocument.mockReset().mockResolvedValue({
    html: "<p>Hello {{contact.name}}</p>",
    text: "Hello {{contact.name}}",
  });
  mockRenderMailyEmail.mockReset().mockResolvedValue({
    subject: "Hello Alex Rivera",
    html: "<html><body><p>Hello Alex Rivera</p></body></html>",
    text: "Hello Alex Rivera",
  });
  mockCreateEmailSendWithRecipients.mockReset().mockResolvedValue({
    id: "send-1",
  });
  mockListEmailEventsForSend.mockReset().mockResolvedValue([]);
  mockListEmailSendRecipients.mockReset().mockResolvedValue([]);
  mockListEmailSends.mockReset().mockResolvedValue([{ id: "send-1" }]);
  mockListEmailManualRecipients.mockReset().mockResolvedValue([MANUAL_RECIPIENT]);
  mockGetEmailManualRecipientsByIds
    .mockReset()
    .mockResolvedValue([MANUAL_RECIPIENT]);
  mockUpsertEmailManualRecipient.mockReset().mockResolvedValue(MANUAL_RECIPIENT);
  mockDeleteRemovableEmailSend.mockReset().mockResolvedValue(true);
  mockQueueEmailSend.mockReset().mockResolvedValue({ id: "send-1" });
  mockListEmailTemplates.mockReset().mockResolvedValue([{ id: "template-1" }]);
  mockFindOrCreateTemplateForDocument
    .mockReset()
    .mockResolvedValue({ templateVersionId: TEMPLATE_VERSION_ID, created: true });
  mockGetEmailProvider.mockReset().mockReturnValue({ name: "fake" });
  mockGetEmailWorkerSecret.mockReset().mockReturnValue("worker-secret");
  mockProcessEmailSendChunks.mockReset().mockResolvedValue({
    processed: 1,
    hasMore: false,
  });
  mockTriggerEmailWorker.mockReset();
  mockAfter.mockReset();
  mockRequireAdmin.mockReset().mockResolvedValue({ id: "admin-1" });
  mockRevalidatePath.mockReset();
});

describe("loadEmailStudioDataAction", () => {
  it("loads email studio data on demand after an admin check", async () => {
    const result = await loadEmailStudioDataAction();

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(result).toEqual({
      templates: [{ id: "template-1" }],
      templateVersionsById: {},
      sends: [{ id: "send-1" }],
    });
  });
});

describe("loadEmailManualRecipientsAction", () => {
  it("loads saved manual recipients after an admin check", async () => {
    const result = await loadEmailManualRecipientsAction();

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockListEmailManualRecipients).toHaveBeenCalled();
    expect(result).toEqual({ manualRecipients: [MANUAL_RECIPIENT] });
  });
});

describe("saveEmailManualRecipientAction", () => {
  it("validates and saves a reusable manual recipient", async () => {
    const result = await saveEmailManualRecipientAction({
      email: " FRIEND@Example.com ",
      name: " Future Applicant ",
    });

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockUpsertEmailManualRecipient).toHaveBeenCalledWith({
      email: "friend@example.com",
      name: "Future Applicant",
      notes: "",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(result).toEqual({ manualRecipient: MANUAL_RECIPIENT });
  });
});

describe("loadEmailTemplatesAction", () => {
  it("loads templates with the first published template version document", async () => {
    mockListEmailTemplates.mockResolvedValue([
      { id: "template-1", current_version_id: TEMPLATE_VERSION_ID },
    ]);

    const result = await loadEmailTemplatesAction();

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockGetEmailTemplateVersion).toHaveBeenCalledWith(TEMPLATE_VERSION_ID);
    expect(result).toEqual({
      templates: [{ id: "template-1", current_version_id: TEMPLATE_VERSION_ID }],
      templateVersionsById: {
        [TEMPLATE_VERSION_ID]: {
          builderJson: { type: "doc", content: [] },
        },
      },
    });
  });
});

describe("loadEmailSendsAction", () => {
  it("loads sent email history separately from templates", async () => {
    const result = await loadEmailSendsAction();

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockListEmailSends).toHaveBeenCalled();
    expect(mockListEmailTemplates).not.toHaveBeenCalled();
    expect(result).toEqual({ sends: [{ id: "send-1" }] });
  });
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

  it("previews selected manual outreach recipients", async () => {
    const result = await previewEmailAction({
      kind: "outreach",
      manualRecipientIds: [MANUAL_RECIPIENT.id],
      subject: "Hello",
    });

    expect(result.eligibleCount).toBe(1);
    expect(mockGetEmailManualRecipientsByIds).toHaveBeenCalledWith([
      MANUAL_RECIPIENT.id,
    ]);
  });
});

describe("renderComposePreviewAction", () => {
  it("renders the final email HTML and subject with sample variables", async () => {
    mockAssertMailyDocument.mockReturnValue({ type: "doc", content: [] });

    const result = await renderComposePreviewAction({
      builderJson: { type: "doc", content: [] },
      subject: "Hello {{contact.name}}",
      previewText: "A note",
    });

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockRenderMailyEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Hello {{contact.name}}",
        variables: expect.objectContaining({
          contact: expect.objectContaining({ name: "Alex Rivera" }),
        }),
      }),
    );
    expect(result).toEqual({
      subject: "Hello Alex Rivera",
      html: "<html><body><p>Hello Alex Rivera</p></body></html>",
    });
  });
});

describe("getComposeRecipientsAction", () => {
  it("lists eligible and skipped outreach recipients by name", async () => {
    mockListActiveEmailSuppressions.mockResolvedValue([
      {
        contact_id: CONTACT_TWO.id,
        email: CONTACT_TWO.email,
        lifted_at: null,
      },
    ]);

    const result = await getComposeRecipientsAction({
      kind: "outreach",
      contactIds: [CONTACT_ONE.id, CONTACT_TWO.id],
    });

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(result.eligible).toEqual([
      { name: CONTACT_ONE.name, email: CONTACT_ONE.email, source: "contact" },
    ]);
    expect(result.skipped).toEqual([
      {
        name: CONTACT_TWO.name,
        email: CONTACT_TWO.email,
        source: "contact",
        reason: "suppressed",
      },
    ]);
  });

  it("tags saved manual recipients with a manual source", async () => {
    const result = await getComposeRecipientsAction({
      kind: "outreach",
      manualRecipientIds: [MANUAL_RECIPIENT.id],
    });

    expect(result.eligible).toEqual([
      {
        name: MANUAL_RECIPIENT.name,
        email: MANUAL_RECIPIENT.email,
        source: "manual",
      },
    ]);
  });

  it("does not itemize broadcast recipients", async () => {
    const result = await getComposeRecipientsAction({ kind: "broadcast" });

    expect(result).toEqual({ eligible: [], skipped: [] });
    expect(mockGetContacts).not.toHaveBeenCalled();
  });

  it("returns nothing when no outreach recipients are selected", async () => {
    const result = await getComposeRecipientsAction({
      kind: "outreach",
      contactIds: [],
      manualRecipientIds: [],
    });

    expect(result).toEqual({ eligible: [], skipped: [] });
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

  it("creates send recipient rows for selected saved manual recipients", async () => {
    await sendEmailNowAction({
      kind: "outreach",
      subject: "Hello {{contact.name}}",
      builderJson: { type: "doc", content: [] },
      manualRecipientIds: [MANUAL_RECIPIENT.id],
    });

    expect(mockCreateEmailSendWithRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "outreach",
        recipients: [
          expect.objectContaining({
            contactId: null,
            email: MANUAL_RECIPIENT.email,
            name: MANUAL_RECIPIENT.name,
            status: "pending",
            personalization: {
              contact: {
                id: MANUAL_RECIPIENT.id,
                name: MANUAL_RECIPIENT.name,
                email: MANUAL_RECIPIENT.email,
              },
              manualRecipient: {
                id: MANUAL_RECIPIENT.id,
              },
            },
          }),
        ],
      }),
    );
  });

  it("deduplicates repeated saved manual recipient ids before creating rows", async () => {
    await sendEmailNowAction({
      kind: "outreach",
      subject: "Hello {{contact.name}}",
      builderJson: { type: "doc", content: [] },
      manualRecipientIds: [MANUAL_RECIPIENT.id, MANUAL_RECIPIENT.id],
    });

    expect(mockGetEmailManualRecipientsByIds).toHaveBeenCalledWith([
      MANUAL_RECIPIENT.id,
    ]);
    expect(
      mockCreateEmailSendWithRecipients.mock.calls[0][0].recipients,
    ).toHaveLength(1);
  });

  it("skips suppressed selected manual recipients", async () => {
    mockListActiveEmailSuppressions.mockResolvedValue([
      {
        contact_id: null,
        email: MANUAL_RECIPIENT.email,
        lifted_at: null,
      },
    ]);

    await sendEmailNowAction({
      kind: "outreach",
      subject: "Hello {{contact.name}}",
      builderJson: { type: "doc", content: [] },
      manualRecipientIds: [MANUAL_RECIPIENT.id],
    });

    expect(mockCreateEmailSendWithRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        recipients: [
          expect.objectContaining({
            contactId: null,
            email: MANUAL_RECIPIENT.email,
            status: "skipped_suppressed",
            skipReason: "suppressed",
          }),
        ],
      }),
    );
  });

  it("rejects manual recipients for broadcasts", async () => {
    await expect(
      sendEmailNowAction({
        kind: "broadcast",
        subject: "Hello {{contact.name}}",
          builderJson: { type: "doc", content: [] },
        manualRecipientIds: [MANUAL_RECIPIENT.id],
      }),
    ).rejects.toThrow("Manual recipients can only be used for outreach");

    expect(mockCreateEmailSendWithRecipients).not.toHaveBeenCalled();
  });

  it("auto-saves the design as a template and records the audience source", async () => {
    mockFindOrCreateTemplateForDocument.mockResolvedValue({
      templateVersionId: TEMPLATE_VERSION_ID,
      created: true,
    });

    await sendEmailNowAction({
      kind: "outreach",
      subject: "Hello {{contact.name}}",
      builderJson: { type: "doc", content: [] },
      contactIds: [CONTACT_ONE.id],
    });

    expect(mockFindOrCreateTemplateForDocument).toHaveBeenCalledWith(
      expect.objectContaining({ subject: "Hello {{contact.name}}" }),
    );
    expect(mockCreateEmailSendWithRecipients).toHaveBeenCalledWith(
      expect.objectContaining({
        templateVersionId: TEMPLATE_VERSION_ID,
        metadata: expect.objectContaining({
          editor: "maily",
          audience: expect.objectContaining({
            kind: "outreach",
            contactCount: 1,
            manualCount: 0,
          }),
        }),
      }),
    );
  });

  it("fails before creating large sends when worker continuation is disabled", async () => {
    mockGetEmailWorkerSecret.mockReturnValue(null);
    mockGetContacts.mockResolvedValue(
      Array.from({ length: 501 }, (_, index) => ({
        ...CONTACT_ONE,
        id: `550e8400-e29b-41d4-a716-44665544${String(index).padStart(4, "0")}`,
        email: `contact-${index}@example.com`,
      })),
    );

    await expect(
      sendEmailNowAction({
        kind: "broadcast",
        subject: "Hello {{contact.name}}",
          builderJson: { type: "doc", content: [] },
      }),
    ).rejects.toThrow("EMAIL_WORKER_SECRET must be set");

    expect(mockCreateEmailSendWithRecipients).not.toHaveBeenCalled();
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
        opened_at: "2026-05-01T00:02:00.000Z",
        clicked_at: "2026-05-01T00:03:00.000Z",
        bounced_at: null,
        complained_at: null,
        unsubscribed_at: null,
        updated_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "recipient-2",
        email: "bounce@example.com",
        contact_name_snapshot: "Bounced Contact",
        status: "bounced",
        skip_reason: null,
        provider: "brevo",
        provider_message_id: "message-2",
        provider_metadata: {},
        send_attempts: 1,
        last_error: null,
        sent_at: "2026-05-01T00:00:00.000Z",
        delivered_at: null,
        opened_at: null,
        clicked_at: null,
        bounced_at: "2026-05-01T00:04:00.000Z",
        complained_at: null,
        unsubscribed_at: null,
        updated_at: "2026-05-01T00:04:00.000Z",
      },
    ]);
    mockListEmailEventsForSend.mockResolvedValue([
      {
        id: "event-1",
        send_id: sendId,
        recipient_id: "recipient-2",
        contact_id: "contact-2",
        type: "bounced",
        provider: "brevo",
        provider_event_id: "bounce-event-1",
        provider_message_id: "message-2",
        event_fingerprint: "fingerprint-1",
        occurred_at: "2026-05-01T00:04:00.000Z",
        payload: {
          event: "hard_bounce",
          reason: "mailbox does not exist",
        },
        created_at: "2026-05-01T00:04:00.000Z",
      },
    ]);

    const result = await getEmailSendDiagnosticsAction(sendId);

    expect(mockRequireAdmin).toHaveBeenCalled();
    expect(mockListEmailSendRecipients).toHaveBeenCalledWith(sendId);
    expect(mockListEmailEventsForSend).toHaveBeenCalledWith(sendId);
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
        failureReason: "Brevo send failed: sender not verified",
        sentAt: "2026-05-01T00:00:00.000Z",
        deliveredAt: null,
        openedAt: "2026-05-01T00:02:00.000Z",
        clickedAt: "2026-05-01T00:03:00.000Z",
        bouncedAt: null,
        complainedAt: null,
        unsubscribedAt: null,
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "recipient-2",
        email: "bounce@example.com",
        name: "Bounced Contact",
        status: "bounced",
        skipReason: null,
        provider: "brevo",
        providerMessageId: "message-2",
        providerRecipientEmail: null,
        testRecipientOverride: false,
        attempts: 1,
        lastError: null,
        failureReason: "Brevo hard bounce: mailbox does not exist",
        sentAt: "2026-05-01T00:00:00.000Z",
        deliveredAt: null,
        openedAt: null,
        clickedAt: null,
        bouncedAt: "2026-05-01T00:04:00.000Z",
        complainedAt: null,
        unsubscribedAt: null,
        updatedAt: "2026-05-01T00:04:00.000Z",
      },
    ]);
  });
});
