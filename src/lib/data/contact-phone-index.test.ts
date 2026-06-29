import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const mockRequireAdmin = vi.fn();

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

function makeQuery(data: unknown = null, error: unknown = null) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of [
    "select",
    "not",
    "order",
    "abortSignal",
  ]) {
    query[method] = vi.fn().mockReturnValue(query);
  }
  query.then = vi.fn((resolve) => resolve({ data, error }));
  return query;
}

describe("contact phone index data", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads contacts and applications with the service-role client for webhook matching", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const contactsQuery = makeQuery([
      {
        id: "contact-1",
        name: "Marina",
        email: "marina@example.com",
        phone: "+12133734253",
        profile_id: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      },
    ]);
    const applicationsQuery = makeQuery([
      {
        id: "application-1",
        user_id: null,
        contact_id: "contact-1",
        program: "academy",
        status: "submitted",
        answers: { phone: "+15551234567" },
        tags: [],
        admin_notes: [],
        submitted_at: "2026-03-02T00:00:00Z",
        updated_at: "2026-03-02T00:00:00Z",
      },
    ]);
    const client = {
      from: vi.fn((table: string) =>
        table === "contacts" ? contactsQuery : applicationsQuery,
      ),
    };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { loadContactPhoneIndexRecords } = await import("./contact-phone-index");
    const records = await loadContactPhoneIndexRecords();

    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(mockRequireAdmin).not.toHaveBeenCalled();
    expect(client.from).toHaveBeenCalledWith("contacts");
    expect(client.from).toHaveBeenCalledWith("applications");
    expect(contactsQuery.select).toHaveBeenCalledWith(
      "id, name, email, phone, profile_id, created_at, updated_at",
    );
    expect(applicationsQuery.select).toHaveBeenCalledWith(
      "id, user_id, contact_id, program, status, answers, tags, admin_notes, submitted_at, updated_at",
    );
    expect(records).toEqual([
      expect.objectContaining({
        contact: expect.objectContaining({ id: "contact-1" }),
        applications: [
          expect.objectContaining({
            id: "application-1",
            contact_id: "contact-1",
          }),
        ],
        contactNotes: [],
        contactTags: [],
      }),
    ]);
  });

  it("reuses a module-level phone-index cache within the TTL", async () => {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const contactsQuery = makeQuery([
      {
        id: "contact-1",
        name: "Marina",
        email: "marina@example.com",
        phone: "+12133734253",
        profile_id: null,
        created_at: "2026-03-01T00:00:00Z",
        updated_at: "2026-03-01T00:00:00Z",
      },
    ]);
    const applicationsQuery = makeQuery([]);
    const client = {
      from: vi.fn((table: string) =>
        table === "contacts" ? contactsQuery : applicationsQuery,
      ),
    };
    vi.mocked(createAdminClient).mockResolvedValue(client as never);

    const { loadContactPhoneIndexRecords } = await import("./contact-phone-index");
    await loadContactPhoneIndexRecords();
    await loadContactPhoneIndexRecords();

    expect(createAdminClient).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledTimes(2);
  });
});
