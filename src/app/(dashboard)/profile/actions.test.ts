import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSupabase = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const { updateProfile, uploadAvatar } = await import("./actions");

const TEST_USER = { id: "user-123", email: "test@test.com" };

// ---------------------------------------------------------------------------
// updateProfile
// ---------------------------------------------------------------------------

describe("updateProfile", () => {
  const prevState = { errors: null, message: null, success: false };

  beforeEach(() => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: TEST_USER },
      error: null,
    });
    mockSupabase.mockQueryResult({}, null);
  });

  it("returns error when not logged in", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const formData = new FormData();
    formData.set("displayName", "Test");
    formData.set("bio", "Hello");

    const result = await updateProfile(prevState, formData);
    expect(result.message).toContain("logged in");
    expect(result.success).toBe(false);
  });

  it("returns validation errors for bad input", async () => {
    const formData = new FormData();
    formData.set("displayName", "A"); // too short
    formData.set("bio", "");

    const result = await updateProfile(prevState, formData);
    expect(result.errors).not.toBeNull();
    expect(result.errors?.displayName).toBeDefined();
  });

  it("returns success on valid update", async () => {
    const formData = new FormData();
    formData.set("displayName", "Test User");
    formData.set("bio", "A bio");

    const result = await updateProfile(prevState, formData);
    expect(result.success).toBe(true);
    expect(result.message).toContain("updated");
  });

  it("returns error on DB failure", async () => {
    mockSupabase.mockQueryResult(null, { message: "DB error" });

    const formData = new FormData();
    formData.set("displayName", "Test User");
    formData.set("bio", "A bio");

    const result = await updateProfile(prevState, formData);
    expect(result.success).toBe(false);
    expect(result.message).toContain("Failed");
  });
});

// ---------------------------------------------------------------------------
// uploadAvatar
// ---------------------------------------------------------------------------

describe("uploadAvatar", () => {
  beforeEach(() => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: TEST_USER },
      error: null,
    });
    mockSupabase.storage.upload.mockResolvedValue({ data: {}, error: null });
    mockSupabase.mockQueryResult({}, null);
  });

  it("returns error when not logged in", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const formData = new FormData();
    const result = await uploadAvatar(formData);
    expect(result.error).toContain("logged in");
  });

  it("returns error for missing file", async () => {
    const formData = new FormData();
    const result = await uploadAvatar(formData);
    expect(result.error).toContain("No file");
  });

  it("returns error for file over 2MB", async () => {
    const bigFile = new File([new ArrayBuffer(3 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });
    const formData = new FormData();
    formData.set("avatar", bigFile);

    const result = await uploadAvatar(formData);
    expect(result.error).toContain("2MB");
  });

  it("returns error for disallowed MIME type", async () => {
    const gifFile = new File(["gif"], "pic.gif", { type: "image/gif" });
    const formData = new FormData();
    formData.set("avatar", gifFile);

    const result = await uploadAvatar(formData);
    expect(result.error).toContain("JPEG, PNG, or WebP");
  });

  it("returns error on upload failure", async () => {
    mockSupabase.storage.upload.mockResolvedValue({
      data: null,
      error: { message: "Storage error" },
    });

    const file = new File(["img"], "avatar.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.set("avatar", file);

    const result = await uploadAvatar(formData);
    expect(result.error).toContain("Upload failed");
  });

  it("returns url on successful upload", async () => {
    const file = new File(["img"], "avatar.jpg", { type: "image/jpeg" });
    const formData = new FormData();
    formData.set("avatar", file);

    const result = await uploadAvatar(formData);
    expect(result.url).toContain("http://test/avatar.jpg");
    expect(result.error).toBeNull();
  });
});
