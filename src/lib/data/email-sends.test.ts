import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

const ADMIN_PROFILE = {
  id: "admin-1",
  email: "admin@example.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
} as const;

describe("email send data access", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(createAdminClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_PROFILE);
  });

  it("creates an email send and recipients through one transaction RPC", async () => {
    const send = { id: "send-1", kind: "outreach", subject_template: "Hello" };
    mockSupabase.mockQueryResult(send);

    const { createEmailSendWithRecipients } = await import("./email-sends");
    const result = await createEmailSendWithRecipients({
      kind: "outreach",
      name: "Owner outreach",
      subjectTemplate: "Hello {{contact.name}}",
      previewText: "Preview",
      fromEmail: "owner@example.com",
      fromName: "Behind The Mask",
      replyToEmail: "owner@example.com",
      templateVersionId: "version-1",
      builderJsonSnapshot: { type: "doc", content: [] },
      htmlPreviewSnapshot: "<p>Hello {{contact.name}}</p>",
      textPreviewSnapshot: "Hello {{contact.name}}",
      metadata: { source: "test" },
      recipients: [
        {
          contactId: "contact-1",
          email: "one@example.com",
          name: "One",
          status: "pending",
          personalization: { contact: { name: "One" } },
        },
      ],
    });

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "create_email_send_with_recipients",
      {
        p_kind: "outreach",
        p_name: "Owner outreach",
        p_subject_template: "Hello {{contact.name}}",
        p_preview_text: "Preview",
        p_from_email: "owner@example.com",
        p_from_name: "Behind The Mask",
        p_reply_to_email: "owner@example.com",
        p_template_version_id: "version-1",
        p_builder_json_snapshot: { type: "doc", content: [] },
        p_html_preview_snapshot: "<p>Hello {{contact.name}}</p>",
        p_text_preview_snapshot: "Hello {{contact.name}}",
        p_metadata: { source: "test" },
        p_recipients: [
          {
            contact_id: "contact-1",
            email: "one@example.com",
            name: "One",
            status: "pending",
            personalization: { contact: { name: "One" } },
            skip_reason: null,
          },
        ],
        p_user_id: "admin-1",
      },
    );
    expect(result).toBe(send);
  });

  it("claims queued recipients with the admin client for worker execution", async () => {
    const recipients = [{ id: "recipient-1", status: "sending" }];
    mockSupabase.mockQueryResult(recipients);

    const { claimQueuedEmailRecipients } = await import("./email-sends");
    const result = await claimQueuedEmailRecipients({
      sendId: "send-1",
      limit: 25,
    });

    const { createAdminClient } = await import("@/lib/supabase/admin");
    const { createClient } = await import("@/lib/supabase/server");
    expect(createAdminClient).toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
    expect(mockSupabase.client.rpc).toHaveBeenCalledWith(
      "claim_queued_email_recipients",
      {
        p_send_id: "send-1",
        p_limit: 25,
      },
    );
    expect(result).toBe(recipients);
  });

  it("deletes only removable email sends", async () => {
    mockSupabase.mockQueryResult({ id: "send-1" });

    const { deleteRemovableEmailSend } = await import("./email-sends");
    const result = await deleteRemovableEmailSend("send-1");

    expect(mockSupabase.client.from).toHaveBeenCalledWith("email_sends");
    expect(mockSupabase.query.delete).toHaveBeenCalled();
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("id", "send-1");
    expect(mockSupabase.query.in).toHaveBeenCalledWith("status", [
      "draft",
      "queued",
      "failed",
    ]);
    expect(mockSupabase.query.select).toHaveBeenCalledWith("id");
    expect(mockSupabase.query.maybeSingle).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it("returns false when no removable email send was deleted", async () => {
    mockSupabase.mockQueryResult(null);

    const { deleteRemovableEmailSend } = await import("./email-sends");
    const result = await deleteRemovableEmailSend("send-1");

    expect(result).toBe(false);
  });
});
