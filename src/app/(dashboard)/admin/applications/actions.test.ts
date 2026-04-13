import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Profile } from "@/types/database";
import { VersionConflictError } from "@/lib/optimistic-concurrency";

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
  preferences: {},
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
const mockRevalidatePath = vi.fn();

vi.mock("@/lib/data/applications", () => ({
  updateApplicationStatus: mockUpdateStatus,
  addApplicationTag: mockAddTag,
  removeApplicationTag: mockRemoveTag,
  addAdminNote: mockAddNote,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const { changeStatus, addTag, removeTag, addNote } = await import("./actions");

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// ---------------------------------------------------------------------------
// changeStatus
// ---------------------------------------------------------------------------

describe("changeStatus", () => {
  beforeEach(() => {
    mockUpdateStatus.mockReset();
    mockRevalidatePath.mockReset();
    mockUpdateStatus.mockResolvedValue({ id: VALID_UUID, contact_id: VALID_UUID });
  });

  it("throws for invalid UUID", async () => {
    await expect(
      changeStatus("not-a-uuid", "accepted", "2024-01-01T00:00:00Z"),
    ).rejects.toThrow(
      "Invalid application ID",
    );
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns success and passes the expected version to updateApplicationStatus", async () => {
    await expect(
      changeStatus(VALID_UUID, "accepted", "2024-01-01T00:00:00Z"),
    ).resolves.toEqual({ ok: true });
    expect(mockUpdateStatus).toHaveBeenCalledWith(VALID_UUID, "accepted", {
      expectedUpdatedAt: "2024-01-01T00:00:00Z",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith(`/admin/contacts/${VALID_UUID}`);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
  });

  it("returns a validation result for invalid statuses", async () => {
    await expect(
      changeStatus(VALID_UUID, "pending", "2024-01-01T00:00:00Z"),
    ).resolves.toEqual({
      ok: false,
      reason: "invalid_status",
      message: "Invalid application status.",
    });
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns a validation result for invalid version timestamps", async () => {
    await expect(changeStatus(VALID_UUID, "accepted", "not-a-date")).resolves.toEqual({
      ok: false,
      reason: "invalid_version",
      message: "This application version is invalid. Refresh and try again.",
    });
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  it("returns a conflict result when another admin updated the application first", async () => {
    mockUpdateStatus.mockRejectedValueOnce(new VersionConflictError("application"));

    await expect(
      changeStatus(VALID_UUID, "accepted", "2024-01-01T00:00:00Z"),
    ).resolves.toEqual({
      ok: false,
      reason: "conflict",
      message: "Another admin updated this application first. Refresh and try again.",
    });
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
