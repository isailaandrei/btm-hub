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

  it("loads email events for send diagnostics ordered newest first", async () => {
    const events = [{ id: "event-1", type: "bounced" }];
    mockSupabase.mockQueryResult(events);

    const { listEmailEventsForSend } = await import("./email-sends");
    const result = await listEmailEventsForSend("send-1");

    expect(mockSupabase.client.from).toHaveBeenCalledWith("email_events");
    expect(mockSupabase.query.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("send_id", "send-1");
    expect(mockSupabase.query.in).toHaveBeenCalledWith("type", [
      "bounced",
      "failed",
      "delivery_delayed",
    ]);
    expect(mockSupabase.query.order).toHaveBeenCalledWith("occurred_at", {
      ascending: false,
    });
    expect(result).toBe(events);
  });

  it("resolves the joined template name onto each send and strips the embed", async () => {
    mockSupabase.mockQueryResult([
      {
        id: "send-1",
        status: "sent",
        email_template_versions: { email_templates: { name: "  Welcome  " } },
      },
      {
        id: "send-2",
        status: "sent",
        email_template_versions: null,
      },
    ]);

    const { listEmailSends } = await import("./email-sends");
    const result = await listEmailSends();

    expect(mockSupabase.query.select).toHaveBeenCalledWith(
      "*, email_template_versions(email_templates!email_template_versions_template_id_fkey(name))",
    );
    expect(result[0]).toMatchObject({ id: "send-1", template_name: "Welcome" });
    expect(result[1]).toMatchObject({ id: "send-2", template_name: null });
    // The raw PostgREST embed must not leak into the returned send shape.
    expect("email_template_versions" in result[0]).toBe(false);
  });

  it("deletes a removable send, clearing its events first", async () => {
    // Single shared mock result: the status pre-check sees a removable status and
    // the final delete returns a row.
    mockSupabase.mockQueryResult({ id: "send-1", status: "sent" });

    const { deleteRemovableEmailSend } = await import("./email-sends");
    const result = await deleteRemovableEmailSend("send-1");

    expect(mockSupabase.client.from).toHaveBeenCalledWith("email_sends");
    // Events are removed explicitly so the delete doesn't orphan them.
    expect(mockSupabase.client.from).toHaveBeenCalledWith("email_events");
    expect(mockSupabase.query.select).toHaveBeenCalledWith("status");
    expect(mockSupabase.query.delete).toHaveBeenCalled();
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("send_id", "send-1");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("id", "send-1");
    // Terminal sends are now removable too — only an in-flight 'sending' is not.
    expect(mockSupabase.query.in).toHaveBeenCalledWith("status", [
      "draft",
      "queued",
      "sent",
      "partially_failed",
      "failed",
    ]);
    expect(mockSupabase.query.select).toHaveBeenCalledWith("id");
    expect(result).toBe(true);
  });

  it("returns false for a non-removable (in-flight) send without deleting", async () => {
    mockSupabase.mockQueryResult({ id: "send-1", status: "sending" });

    const { deleteRemovableEmailSend } = await import("./email-sends");
    const result = await deleteRemovableEmailSend("send-1");

    expect(result).toBe(false);
    expect(mockSupabase.query.delete).not.toHaveBeenCalled();
  });

  it("returns false when the send no longer exists", async () => {
    mockSupabase.mockQueryResult(null);

    const { deleteRemovableEmailSend } = await import("./email-sends");
    const result = await deleteRemovableEmailSend("send-1");

    expect(result).toBe(false);
  });
});
