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

const { updatePreferences, bulkAssignTag } = await import("./actions");

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

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("bulkAssignTag", () => {
  beforeEach(() => {
    mockBulkAssignTags.mockResolvedValue({});
  });

  it("throws for invalid contact UUID", async () => {
    await expect(bulkAssignTag(["not-a-uuid"], VALID_UUID)).rejects.toThrow(
      "Invalid contact ID",
    );
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });

  it("throws for invalid tag UUID", async () => {
    await expect(bulkAssignTag([VALID_UUID], "bad")).rejects.toThrow(
      "Invalid tag ID",
    );
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });

  it("calls bulkAssignTags with valid input", async () => {
    const ids = [VALID_UUID, "660e8400-e29b-41d4-a716-446655440001"];
    await bulkAssignTag(ids, VALID_UUID);
    expect(mockBulkAssignTags).toHaveBeenCalledWith(ids, VALID_UUID);
  });

  it("does nothing for empty array", async () => {
    await bulkAssignTag([], VALID_UUID);
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });
});
