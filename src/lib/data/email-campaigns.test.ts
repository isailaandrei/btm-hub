import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

describe("email campaign data access", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(requireAdmin).mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      display_name: "Admin",
      bio: null,
      avatar_url: null,
      role: "admin",
      preferences: {},
      created_at: "2026-04-28T00:00:00.000Z",
      updated_at: "2026-04-28T00:00:00.000Z",
    });
  });

  it("creates campaigns with the current admin as creator and updater", async () => {
    const campaign = { id: "campaign-1", kind: "broadcast", subject: "Hello" };
    mockSupabase.mockQueryResult(campaign);

    const { createEmailCampaign } = await import("./email-campaigns");
    const result = await createEmailCampaign({
      kind: "broadcast",
      name: "Newsletter",
      subject: "Hello",
      previewText: "Preview",
      fromEmail: "hello@mail.behind-the-mask.com",
      fromName: "Behind The Mask",
      replyToEmail: "reply@replies.behind-the-mask.com",
      templateVersionId: null,
      htmlSnapshot: "<p>Hello</p>",
      textSnapshot: "Hello",
    });

    expect(mockSupabase.client.from).toHaveBeenCalledWith("email_campaigns");
    expect(mockSupabase.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "broadcast",
        name: "Newsletter",
        subject: "Hello",
        preview_text: "Preview",
        created_by: "admin-1",
        updated_by: "admin-1",
      }),
    );
    expect(result).toBe(campaign);
  });

  it("returns null when appending a duplicate provider event", async () => {
    mockSupabase.mockQueryResult(null, { code: "23505", message: "duplicate" });

    const { appendEmailEvent } = await import("./email-campaigns");
    const result = await appendEmailEvent({
      campaignId: "campaign-1",
      recipientId: "recipient-1",
      contactId: "contact-1",
      type: "delivered",
      provider: "fake",
      providerEventId: "event-1",
      providerMessageId: "message-1",
      occurredAt: "2026-04-28T00:00:00.000Z",
      payload: { id: "event-1" },
    });

    expect(result).toBeNull();
  });

  it("inserts campaign recipients with contact and personalization snapshots", async () => {
    const recipients = [{ id: "recipient-1", email: "one@example.com" }];
    mockSupabase.mockQueryResult(recipients);

    const { insertEmailRecipients } = await import("./email-campaigns");
    const result = await insertEmailRecipients({
      campaignId: "campaign-1",
      recipients: [
        {
          contactId: "contact-1",
          email: "one@example.com",
          name: "One",
          personalization: { contact: { name: "One" } },
        },
      ],
    });

    expect(mockSupabase.client.from).toHaveBeenCalledWith("email_campaign_recipients");
    expect(mockSupabase.query.insert).toHaveBeenCalledWith([
      {
        campaign_id: "campaign-1",
        contact_id: "contact-1",
        email: "one@example.com",
        contact_name_snapshot: "One",
        personalization_snapshot: { contact: { name: "One" } },
        status: "pending",
      },
    ]);
    expect(result).toBe(recipients);
  });

  it("normalizes suppressed emails before insert", async () => {
    mockSupabase.mockQueryResult({ id: "suppression-1" });

    const { suppressEmail } = await import("./email-campaigns");
    await suppressEmail({
      contactId: "contact-1",
      email: "  PERSON@Example.COM ",
      reason: "manual",
      detail: "Asked not to receive email",
    });

    expect(mockSupabase.client.from).toHaveBeenCalledWith("email_suppressions");
    expect(mockSupabase.query.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: "contact-1",
        email: "person@example.com",
        reason: "manual",
        detail: "Asked not to receive email",
        created_by: "admin-1",
      }),
    );
  });
});
