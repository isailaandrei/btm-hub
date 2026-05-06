import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMockSupabaseClient } from "@/test/mocks/supabase";

const mockSupabase = createMockSupabaseClient();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn().mockResolvedValue(mockSupabase.client),
}));

const {
  getPortfolioItemsByProfileId,
  getPortfolioItemsByContactProfileId,
} = await import("./profile-portfolio");

const row = {
  id: "item-1",
  profile_id: "profile-1",
  storage_path: "profile-1/file.jpg",
  original_filename: "file.jpg",
  mime_type: "image/jpeg",
  size_bytes: 123,
  title: "Reef",
  caption: "Coral wall",
  sort_order: 0,
  created_at: "2026-05-06T00:00:00.000Z",
  updated_at: "2026-05-06T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSupabase.mockQueryResult([row], null);
  mockSupabase.storage.createSignedUrls.mockResolvedValue({
    data: [{ path: row.storage_path, signedUrl: "http://signed/file.jpg" }],
    error: null,
  });
});

describe("profile portfolio fetchers", () => {
  it("loads profile portfolio rows with signed URLs", async () => {
    const result = await getPortfolioItemsByProfileId("profile-1");

    expect(mockSupabase.client.from).toHaveBeenCalledWith(
      "profile_portfolio_items",
    );
    expect(mockSupabase.query.eq).toHaveBeenCalledWith(
      "profile_id",
      "profile-1",
    );
    expect(mockSupabase.storage.createSignedUrls).toHaveBeenCalledWith(
      [row.storage_path],
      60 * 10,
    );
    expect(result).toEqual([
      { ...row, signedUrl: "http://signed/file.jpg", imageError: null },
    ]);
  });

  it("returns empty array without signing when there are no rows", async () => {
    mockSupabase.mockQueryResult([], null);

    await expect(getPortfolioItemsByProfileId("profile-2")).resolves.toEqual(
      [],
    );
    expect(mockSupabase.storage.createSignedUrls).not.toHaveBeenCalled();
  });

  it("returns per-item degraded state when signed URL generation fails", async () => {
    mockSupabase.storage.createSignedUrls.mockResolvedValue({
      data: null,
      error: { message: "storage unavailable" },
    });

    await expect(getPortfolioItemsByProfileId("profile-3")).resolves.toEqual([
      {
        ...row,
        signedUrl: null,
        imageError: "Failed to sign portfolio images: storage unavailable",
      },
    ]);
  });

  it("loads by contact profile id", async () => {
    await getPortfolioItemsByContactProfileId({ profileId: "profile-4" });

    expect(mockSupabase.query.eq).toHaveBeenCalledWith(
      "profile_id",
      "profile-4",
    );
  });

  it("returns no admin portfolio rows when contact has no profile", async () => {
    await expect(
      getPortfolioItemsByContactProfileId({ profileId: null }),
    ).resolves.toEqual([]);
  });
});
