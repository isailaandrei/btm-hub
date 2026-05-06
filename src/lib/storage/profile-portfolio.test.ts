import { describe, expect, it, vi } from "vitest";
import {
  ALLOWED_PORTFOLIO_IMAGE_TYPES,
  extensionForPortfolioMimeType,
  getProfilePortfolioUploadEndpoint,
  isAllowedPortfolioImageType,
  portfolioStoragePath,
} from "./profile-portfolio";

describe("profile portfolio storage helpers", () => {
  it("allows only JPEG, PNG, and WebP", () => {
    expect([...ALLOWED_PORTFOLIO_IMAGE_TYPES]).toEqual([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(isAllowedPortfolioImageType("image/jpeg")).toBe(true);
    expect(isAllowedPortfolioImageType("image/png")).toBe(true);
    expect(isAllowedPortfolioImageType("image/webp")).toBe(true);
    expect(isAllowedPortfolioImageType("image/heic")).toBe(false);
    expect(isAllowedPortfolioImageType("image/gif")).toBe(false);
  });

  it("maps allowed MIME types to stable extensions", () => {
    expect(extensionForPortfolioMimeType("image/jpeg")).toBe("jpg");
    expect(extensionForPortfolioMimeType("image/png")).toBe("png");
    expect(extensionForPortfolioMimeType("image/webp")).toBe("webp");
    expect(() => extensionForPortfolioMimeType("image/heic")).toThrow(
      "Unsupported portfolio image type",
    );
  });

  it("creates owner-scoped unique storage paths", () => {
    vi.spyOn(crypto, "randomUUID").mockReturnValue(
      "11111111-1111-4111-8111-111111111111",
    );

    expect(portfolioStoragePath("profile-1", "image/png")).toBe(
      "profile-1/11111111-1111-4111-8111-111111111111.png",
    );
  });

  it("uses local Supabase storage endpoint for localhost", () => {
    expect(getProfilePortfolioUploadEndpoint("http://127.0.0.1:54321")).toBe(
      "http://127.0.0.1:54321/storage/v1/upload/resumable",
    );
  });

  it("uses direct storage hostname for hosted Supabase", () => {
    expect(getProfilePortfolioUploadEndpoint("https://abcxyz.supabase.co")).toBe(
      "https://abcxyz.storage.supabase.co/storage/v1/upload/resumable",
    );
  });
});
