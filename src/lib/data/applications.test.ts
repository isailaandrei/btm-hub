import { describe, it, expect, vi, beforeEach } from "vitest";
import { getApplicantName, escapeSearchTerm } from "./applications";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

// Mock modules
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn(),
}));

// ---------------------------------------------------------------------------
// getApplicantName
// ---------------------------------------------------------------------------

describe("getApplicantName", () => {
  it("returns full name from first and last", () => {
    expect(
      getApplicantName({ first_name: "Alice", last_name: "Smith" }),
    ).toBe("Alice Smith");
  });

  it("returns first name only when last is missing", () => {
    expect(getApplicantName({ first_name: "Alice" })).toBe("Alice");
  });

  it("returns last name only when first is missing", () => {
    expect(getApplicantName({ last_name: "Smith" })).toBe("Smith");
  });

  it("returns fallback when both names are missing", () => {
    expect(getApplicantName({})).toBe("—");
  });

  it("uses custom fallback", () => {
    expect(getApplicantName({}, "Unknown")).toBe("Unknown");
  });

  it("ignores empty string names", () => {
    expect(getApplicantName({ first_name: "", last_name: "" })).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// escapeSearchTerm
// ---------------------------------------------------------------------------

describe("escapeSearchTerm", () => {
  it("escapes percent sign", () => {
    expect(escapeSearchTerm("100%")).toBe("100\\%");
  });

  it("escapes underscore", () => {
    expect(escapeSearchTerm("hello_world")).toBe("hello\\_world");
  });

  it("escapes backslash", () => {
    expect(escapeSearchTerm("a\\b")).toBe("a\\\\b");
  });

  it("removes dots", () => {
    expect(escapeSearchTerm("Dr. Smith")).toBe("Dr Smith");
  });

  it("removes parentheses", () => {
    expect(escapeSearchTerm("John (Jr)")).toBe("John Jr");
  });

  it("removes commas", () => {
    expect(escapeSearchTerm("Smith, John")).toBe("Smith John");
  });

  it("handles multiple special characters", () => {
    expect(escapeSearchTerm("100% (test)._x")).toBe("100\\% test\\_x");
  });

  it("passes through normal text unchanged", () => {
    expect(escapeSearchTerm("Alice Smith")).toBe("Alice Smith");
  });
});

// ---------------------------------------------------------------------------
// addApplicationTag
// ---------------------------------------------------------------------------

describe("addApplicationTag", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("calls rpc with correct params", async () => {
    const fakeApp = { id: "app-1", tags: ["urgent"], admin_notes: [] };
    mockSupabase.mockQueryResult(fakeApp);

    const { addApplicationTag } = await import("./applications");
    const result = await addApplicationTag("app-1", "priority");

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith("add_application_tag", {
      app_id: "app-1",
      new_tag: "priority",
    });
    expect(result).toEqual(fakeApp);
  });

  it("throws when rpc returns an error", async () => {
    mockSupabase.mockQueryResult(null, { message: "DB error" });

    const { addApplicationTag } = await import("./applications");
    await expect(addApplicationTag("app-1", "priority")).rejects.toThrow(
      "Failed to add tag: DB error",
    );
  });
});

// ---------------------------------------------------------------------------
// removeApplicationTag
// ---------------------------------------------------------------------------

describe("removeApplicationTag", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("calls rpc with correct params", async () => {
    const fakeApp = { id: "app-1", tags: [], admin_notes: [] };
    mockSupabase.mockQueryResult(fakeApp);

    const { removeApplicationTag } = await import("./applications");
    const result = await removeApplicationTag("app-1", "urgent");

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith("remove_application_tag", {
      app_id: "app-1",
      old_tag: "urgent",
    });
    expect(result).toEqual(fakeApp);
  });

  it("throws when rpc returns an error", async () => {
    mockSupabase.mockQueryResult(null, { message: "DB error" });

    const { removeApplicationTag } = await import("./applications");
    await expect(removeApplicationTag("app-1", "urgent")).rejects.toThrow(
      "Failed to remove tag: DB error",
    );
  });
});

// ---------------------------------------------------------------------------
// addAdminNote
// ---------------------------------------------------------------------------

describe("addAdminNote", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(async () => {
    vi.resetModules();
    mockSupabase = createMockSupabaseClient();
    const { createClient } = await import("@/lib/supabase/server");
    vi.mocked(createClient).mockResolvedValue(mockSupabase.client as never);
  });

  it("calls rpc with correct params", async () => {
    const fakeApp = { id: "app-1", tags: [], admin_notes: [{ author_id: "u1", author_name: "Admin", text: "note", created_at: "2026-01-01" }] };
    mockSupabase.mockQueryResult(fakeApp);

    const { addAdminNote } = await import("./applications");
    const result = await addAdminNote("app-1", "u1", "Admin", "note");

    expect(mockSupabase.client.rpc).toHaveBeenCalledWith("add_admin_note", {
      app_id: "app-1",
      note_author_id: "u1",
      note_author_name: "Admin",
      note_text: "note",
    });
    expect(result).toEqual(fakeApp);
  });

  it("throws when rpc returns an error", async () => {
    mockSupabase.mockQueryResult(null, { message: "DB error" });

    const { addAdminNote } = await import("./applications");
    await expect(addAdminNote("app-1", "u1", "Admin", "note")).rejects.toThrow(
      "Failed to add admin note: DB error",
    );
  });
});
