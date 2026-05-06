import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();
const mockRevalidatePath = vi.fn();
const mockGetContactIdsByProfileId = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

vi.mock("@/lib/data/contacts", () => ({
  getContactIdsByProfileId: mockGetContactIdsByProfileId,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

const {
  createPortfolioItemAction,
  updatePortfolioItemAction,
  deletePortfolioItemAction,
} = await import("./actions");

const user = { id: "profile-1", email: "member@example.com" };

beforeEach(() => {
  vi.clearAllMocks();
  mockRevalidatePath.mockReset();
  mockGetContactIdsByProfileId.mockReset().mockResolvedValue(["contact-1"]);
  mockSupabase.auth.getUser.mockResolvedValue({ data: { user }, error: null });
  mockSupabase.mockQueryResult({ id: "item-1" }, null, 0);
  mockSupabase.storage.list.mockResolvedValue({
    data: [{ name: "file.jpg", metadata: { size: 10 } }],
    error: null,
  });
  mockSupabase.storage.remove.mockResolvedValue({ data: [], error: null });
});

describe("createPortfolioItemAction", () => {
  it("rejects anonymous users", async () => {
    mockSupabase.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    await expect(
      createPortfolioItemAction({
        storagePath: "profile-1/file.jpg",
        originalFilename: "file.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("You must be logged in");
  });

  it("rejects paths outside the user's folder", async () => {
    await expect(
      createPortfolioItemAction({
        storagePath: "other/file.jpg",
        originalFilename: "file.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("Invalid portfolio storage path");
  });

  it("rejects unsupported MIME types", async () => {
    await expect(
      createPortfolioItemAction({
        storagePath: "profile-1/file.heic",
        originalFilename: "file.heic",
        mimeType: "image/heic",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("Portfolio images must be JPEG, PNG, or WebP");
  });

  it("rejects metadata for objects that are not in storage", async () => {
    mockSupabase.storage.list.mockResolvedValue({ data: [], error: null });

    await expect(
      createPortfolioItemAction({
        storagePath: "profile-1/missing.jpg",
        originalFilename: "missing.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("Uploaded portfolio image was not found");
  });

  it("rejects profiles that already reached the item limit", async () => {
    mockSupabase.mockQueryResult(null, null, 50);

    await expect(
      createPortfolioItemAction({
        storagePath: "profile-1/file.jpg",
        originalFilename: "file.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        title: "",
        caption: "",
      }),
    ).rejects.toThrow("Portfolio limit reached");
  });

  it("inserts portfolio metadata and revalidates profile surfaces", async () => {
    const result = await createPortfolioItemAction({
      storagePath: "profile-1/file.jpg",
      originalFilename: "file.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 10,
      title: " Reef ",
      caption: " Coral wall ",
    });

    expect(result).toEqual({ id: "item-1" });
    expect(mockSupabase.client.from).toHaveBeenCalledWith(
      "profile_portfolio_items",
    );
    expect(mockSupabase.query.insert).toHaveBeenCalledWith({
      profile_id: "profile-1",
      storage_path: "profile-1/file.jpg",
      original_filename: "file.jpg",
      mime_type: "image/jpeg",
      size_bytes: 10,
      title: "Reef",
      caption: "Coral wall",
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith("/profile", "layout");
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/community/members/profile-1",
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin");
    expect(mockRevalidatePath).toHaveBeenCalledWith(
      "/admin/contacts/contact-1",
    );
  });
});

describe("updatePortfolioItemAction", () => {
  it("updates only owner metadata", async () => {
    await updatePortfolioItemAction("item-1", {
      title: "New title",
      caption: "",
    });

    expect(mockSupabase.query.update).toHaveBeenCalledWith({
      title: "New title",
      caption: null,
      updated_at: expect.any(String),
    });
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("id", "item-1");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith(
      "profile_id",
      "profile-1",
    );
  });
});

describe("deletePortfolioItemAction", () => {
  it("loads owner item, removes storage, then deletes metadata", async () => {
    mockSupabase.mockQueryResult({
      id: "item-1",
      profile_id: "profile-1",
      storage_path: "profile-1/file.jpg",
    });

    await deletePortfolioItemAction("item-1");

    expect(mockSupabase.storage.remove).toHaveBeenCalledWith([
      "profile-1/file.jpg",
    ]);
    expect(mockSupabase.query.delete).toHaveBeenCalled();
    expect(mockSupabase.query.eq).toHaveBeenCalledWith("id", "item-1");
    expect(mockSupabase.query.eq).toHaveBeenCalledWith(
      "profile_id",
      "profile-1",
    );
  });
});
