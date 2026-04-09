import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Profile } from "@/types/database";

const mockProfile: Profile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "admin@test.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  preferences: {},
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(mockProfile),
}));

const mockUpdateContact = vi.fn();
const mockAssignTag = vi.fn();
const mockUnassignTag = vi.fn();
const mockAddContactNote = vi.fn();
const mockBulkAssignTags = vi.fn();

vi.mock("@/lib/data/contacts", () => ({
  updateContact: mockUpdateContact,
  assignTag: mockAssignTag,
  unassignTag: mockUnassignTag,
  addContactNote: mockAddContactNote,
  bulkAssignTags: mockBulkAssignTags,
}));

const mockUpdateProfilePreferences = vi.fn();

vi.mock("@/lib/data/profiles", () => ({
  updateProfilePreferences: mockUpdateProfilePreferences,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { updatePreferences } = await import("./actions");

describe("updatePreferences", () => {
  beforeEach(() => {
    mockUpdateProfilePreferences.mockResolvedValue({});
  });

  it("calls updateProfilePreferences with admin id and patch", async () => {
    const patch = { contacts_table: { visible_columns: ["budget"] } };
    await updatePreferences(patch);
    expect(mockUpdateProfilePreferences).toHaveBeenCalledWith(mockProfile.id, patch);
  });
});
