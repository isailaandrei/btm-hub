import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRequireAdmin = vi.fn();
const mockCreateAdminClient = vi.fn();
const mockCreateEmailAsset = vi.fn();
const mockRevalidatePath = vi.fn();
const mockUpload = vi.fn();
const mockGetPublicUrl = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/auth/require-admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/data/email-assets", () => ({
  EMAIL_ASSET_BUCKET: "email-assets",
  createEmailAsset: mockCreateEmailAsset,
}));

const { uploadEmailAssetAction } = await import("./actions");

describe("uploadEmailAssetAction", () => {
  beforeEach(() => {
    mockRequireAdmin.mockResolvedValue({ id: "admin-1" });
    mockUpload.mockResolvedValue({ error: null });
    mockGetPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.supabase.co/storage/v1/object/public/email-assets/admin-1/image.png" },
    });
    mockCreateAdminClient.mockResolvedValue({
      storage: {
        from: () => ({
          upload: mockUpload,
          getPublicUrl: mockGetPublicUrl,
        }),
      },
    });
    mockCreateEmailAsset.mockResolvedValue({
      id: "asset-1",
      public_url: "https://example.supabase.co/storage/v1/object/public/email-assets/admin-1/image.png",
    });
  });

  it("uploads immutable email images with long browser cache headers", async () => {
    const formData = new FormData();
    formData.set(
      "image",
      new File(["image"], "header.png", { type: "image/png" }),
    );

    await uploadEmailAssetAction(formData);

    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^admin-1\/.+\.png$/),
      expect.any(File),
      expect.objectContaining({
        cacheControl: "31536000",
        contentType: "image/png",
        upsert: false,
      }),
    );
  });
});
