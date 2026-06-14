import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
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

describe("email manual recipient data access", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    const { requireAdmin } = await import("@/lib/auth/require-admin");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_PROFILE);
  });

  it("lists saved manual recipients newest first by name", async () => {
    const recipients = [
      {
        id: "manual-1",
        email: "test@example.com",
        name: "Test Inbox",
      },
    ];
    mockSupabase.mockQueryResult(recipients);

    const { listEmailManualRecipients } = await import(
      "./email-manual-recipients"
    );
    const result = await listEmailManualRecipients();

    expect(mockSupabase.client.from).toHaveBeenCalledWith(
      "email_manual_recipients",
    );
    expect(mockSupabase.query.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.query.order).toHaveBeenCalledWith("name", {
      ascending: true,
    });
    expect(result).toBe(recipients);
  });

  it("loads selected manual recipients by id", async () => {
    const recipients = [{ id: "manual-1", email: "one@example.com" }];
    mockSupabase.mockQueryResult(recipients);

    const { getEmailManualRecipientsByIds } = await import(
      "./email-manual-recipients"
    );
    const result = await getEmailManualRecipientsByIds(["manual-1", "manual-2"]);

    expect(mockSupabase.client.from).toHaveBeenCalledWith(
      "email_manual_recipients",
    );
    expect(mockSupabase.query.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.query.in).toHaveBeenCalledWith("id", [
      "manual-1",
      "manual-2",
    ]);
    expect(result).toBe(recipients);
  });

  it("upserts a normalized manual recipient after an admin check", async () => {
    const recipient = {
      id: "manual-1",
      email: "test@example.com",
      name: "Test Inbox",
      notes: "",
    };
    mockSupabase.mockQueryResult(recipient);

    const { upsertEmailManualRecipient } = await import(
      "./email-manual-recipients"
    );
    const result = await upsertEmailManualRecipient({
      email: " TEST@Example.com ",
      name: " Test Inbox ",
    });

    expect(mockSupabase.client.from).toHaveBeenCalledWith(
      "email_manual_recipients",
    );
    expect(mockSupabase.query.upsert).toHaveBeenCalledWith(
      {
        email: "test@example.com",
        name: "Test Inbox",
        notes: "",
        created_by: "admin-1",
        updated_by: "admin-1",
        updated_at: expect.any(String),
      },
      { onConflict: "email" },
    );
    expect(mockSupabase.query.select).toHaveBeenCalledWith("*");
    expect(mockSupabase.query.single).toHaveBeenCalled();
    expect(result).toBe(recipient);
  });
});
