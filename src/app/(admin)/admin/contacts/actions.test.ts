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
const mockBulkAssignTags = vi.fn();
const mockBulkUnassignTags = vi.fn();
const mockDeleteApplication = vi.fn();
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/data/contacts", () => ({
  updateContact: mockUpdateContact,
  assignTag: mockAssignTag,
  unassignTag: mockUnassignTag,
  bulkAssignTags: mockBulkAssignTags,
  bulkUnassignTags: mockBulkUnassignTags,
  deleteApplication: mockDeleteApplication,
}));

const mockUpdateProfilePreferences = vi.fn();

vi.mock("@/lib/data/profiles", () => ({
  updateProfilePreferences: mockUpdateProfilePreferences,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const {
  updatePreferences,
  bulkAssignTag,
  bulkUnassignTag,
  editContact,
  deleteApplication,
} = await import(
  "./actions"
);

describe("updatePreferences", () => {
  beforeEach(() => {
    mockProfile.preferences = {};
    mockUpdateProfilePreferences.mockResolvedValue({});
  });

  it("calls updateProfilePreferences with admin id and patch", async () => {
    const patch = { contacts_table: { visible_columns: ["budget"] } };
    await updatePreferences(patch);
    expect(mockUpdateProfilePreferences).toHaveBeenCalledWith(mockProfile.id, patch);
  });

  it("preserves existing contacts_table preferences when patching one key", async () => {
    mockProfile.preferences = {
      contacts_table: {
        visible_columns: ["budget"],
        previously_selected_columns: ["budget", "age"],
      },
    };

    await updatePreferences({
      contacts_table: {
        sort_by: { key: "name", direction: "asc" },
        page_size: 50,
      },
    });

    expect(mockUpdateProfilePreferences).toHaveBeenCalledWith(mockProfile.id, {
      contacts_table: {
        visible_columns: ["budget"],
        previously_selected_columns: ["budget", "age"],
        sort_by: { key: "name", direction: "asc" },
        page_size: 50,
      },
    });
  });

  it("rejects unsupported preference keys", async () => {
    await expect(
      updatePreferences({ contacts_table: { dangerous: true } }),
    ).rejects.toThrow("Invalid preferences");

    expect(mockUpdateProfilePreferences).not.toHaveBeenCalled();
  });

  it("rejects invalid contacts table sort preferences", async () => {
    await expect(
      updatePreferences({
        contacts_table: {
          sort_by: { key: "name", direction: "sideways" },
        },
      }),
    ).rejects.toThrow("Invalid preferences");

    expect(mockUpdateProfilePreferences).not.toHaveBeenCalled();
  });
});

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

describe("bulkAssignTag", () => {
  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockBulkAssignTags.mockResolvedValue({
      requested: 2,
      existing: 2,
      inserted: 2,
      alreadyAssigned: 0,
      skippedMissing: 0,
    });
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
    await expect(bulkAssignTag(ids, VALID_UUID)).resolves.toEqual({
      requested: 2,
      existing: 2,
      inserted: 2,
      alreadyAssigned: 0,
      skippedMissing: 0,
    });
    expect(mockBulkAssignTags).toHaveBeenCalledWith(ids, VALID_UUID);
  });

  it("does nothing for empty array", async () => {
    await bulkAssignTag([], VALID_UUID);
    expect(mockBulkAssignTags).not.toHaveBeenCalled();
  });
});

describe("editContact", () => {
  beforeEach(() => {
    mockUpdateContact.mockResolvedValue(undefined);
  });

  it("rejects invalid email addresses before touching the data layer", async () => {
    await expect(
      editContact(VALID_UUID, { email: "not-an-email" }),
    ).rejects.toThrow("Please enter a valid email address");
    expect(mockUpdateContact).not.toHaveBeenCalled();
  });

  it("passes the expectedUpdatedAt option through for conflict checks", async () => {
    await editContact(
      VALID_UUID,
      { email: "ADMIN@TEST.COM " },
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );

    expect(mockUpdateContact).toHaveBeenCalledWith(
      VALID_UUID,
      { email: "admin@test.com" },
      { expectedUpdatedAt: "2024-01-01T00:00:00Z" },
    );
  });
});


describe("deleteApplication", () => {
  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockDeleteApplication.mockResolvedValue({
      id: VALID_UUID,
      contact_id: "660e8400-e29b-41d4-a716-446655440001",
    });
  });

  it("revalidates the deleted application's contact detail path and /admin", async () => {
    await deleteApplication(VALID_UUID);

    expect(mockDeleteApplication).toHaveBeenCalledWith(VALID_UUID);
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/admin/contacts/660e8400-e29b-41d4-a716-446655440001",
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
  });
});

describe("bulkUnassignTag", () => {
  beforeEach(() => {
    mockRevalidatePath.mockReset();
    mockBulkUnassignTags.mockResolvedValue({});
  });

  it("throws for invalid contact UUID", async () => {
    await expect(bulkUnassignTag(["not-a-uuid"], VALID_UUID)).rejects.toThrow(
      "Invalid contact ID",
    );
    expect(mockBulkUnassignTags).not.toHaveBeenCalled();
  });

  it("throws for invalid tag UUID", async () => {
    await expect(bulkUnassignTag([VALID_UUID], "bad")).rejects.toThrow(
      "Invalid tag ID",
    );
    expect(mockBulkUnassignTags).not.toHaveBeenCalled();
  });

  it("calls bulkUnassignTags with valid input", async () => {
    const ids = [VALID_UUID, "660e8400-e29b-41d4-a716-446655440001"];
    await bulkUnassignTag(ids, VALID_UUID);
    expect(mockBulkUnassignTags).toHaveBeenCalledWith(ids, VALID_UUID);
  });

  it("does nothing for empty array", async () => {
    await bulkUnassignTag([], VALID_UUID);
    expect(mockBulkUnassignTags).not.toHaveBeenCalled();
  });
});
