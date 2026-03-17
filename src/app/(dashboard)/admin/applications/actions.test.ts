import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Profile } from "@/types/database";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockProfile: Profile = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  email: "admin@test.com",
  display_name: "Admin",
  bio: null,
  avatar_url: null,
  role: "admin",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: vi.fn().mockResolvedValue(mockProfile),
}));

const mockUpdateStatus = vi.fn();
const mockAddTag = vi.fn();
const mockRemoveTag = vi.fn();
const mockAddNote = vi.fn();

vi.mock("@/lib/data/applications", () => ({
  updateApplicationStatus: mockUpdateStatus,
  addApplicationTag: mockAddTag,
  removeApplicationTag: mockRemoveTag,
  addAdminNote: mockAddNote,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { changeStatus, addTag, removeTag, addNote } = await import("./actions");

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// ---------------------------------------------------------------------------
// changeStatus
// ---------------------------------------------------------------------------

describe("changeStatus", () => {
  beforeEach(() => {
    mockUpdateStatus.mockResolvedValue({});
  });

  it("throws for invalid UUID", async () => {
    await expect(changeStatus("not-a-uuid", "accepted")).rejects.toThrow(
      "Invalid application ID",
    );
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("calls updateApplicationStatus with valid input", async () => {
    await changeStatus(VALID_UUID, "accepted");
    expect(mockUpdateStatus).toHaveBeenCalledWith(VALID_UUID, "accepted");
  });
});

// ---------------------------------------------------------------------------
// addTag
// ---------------------------------------------------------------------------

describe("addTag", () => {
  beforeEach(() => {
    mockAddTag.mockResolvedValue({});
  });

  it("throws for invalid UUID", async () => {
    await expect(addTag("bad", "tag")).rejects.toThrow();
  });

  it("trims and truncates tag to 50 chars", async () => {
    await addTag(VALID_UUID, "  " + "a".repeat(60) + "  ");
    expect(mockAddTag).toHaveBeenCalledWith(VALID_UUID, "a".repeat(50));
  });

  it("skips empty tag after trimming", async () => {
    await addTag(VALID_UUID, "   ");
    expect(mockAddTag).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// removeTag
// ---------------------------------------------------------------------------

describe("removeTag", () => {
  beforeEach(() => {
    mockRemoveTag.mockResolvedValue({});
  });

  it("calls removeApplicationTag with valid input", async () => {
    await removeTag(VALID_UUID, "urgent");
    expect(mockRemoveTag).toHaveBeenCalledWith(VALID_UUID, "urgent");
  });
});

// ---------------------------------------------------------------------------
// addNote
// ---------------------------------------------------------------------------

describe("addNote", () => {
  beforeEach(() => {
    mockAddNote.mockResolvedValue({});
  });

  it("passes admin profile info to addAdminNote", async () => {
    await addNote(VALID_UUID, "Looks good");
    expect(mockAddNote).toHaveBeenCalledWith(
      VALID_UUID,
      mockProfile.id,
      "Admin",
      "Looks good",
    );
  });

  it("trims note text", async () => {
    await addNote(VALID_UUID, "  spaced  ");
    expect(mockAddNote).toHaveBeenCalledWith(
      VALID_UUID,
      mockProfile.id,
      "Admin",
      "spaced",
    );
  });

  it("skips empty note after trimming", async () => {
    await addNote(VALID_UUID, "   ");
    expect(mockAddNote).not.toHaveBeenCalled();
  });
});
