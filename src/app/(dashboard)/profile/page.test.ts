import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetProfile = vi.fn();
const mockRedirect = vi.fn((url: string) => {
  throw new Error(`NEXT_REDIRECT: ${url}`);
});

vi.mock("@/lib/data/profiles", () => ({
  getProfile: mockGetProfile,
}));

vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));

vi.mock("./profile-form", () => ({
  ProfileForm: () => null,
}));

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects home instead of to login when the gated profile record is unavailable", async () => {
    mockGetProfile.mockResolvedValue(null);

    const { default: ProfilePage } = await import("./page");

    await expect(ProfilePage()).rejects.toThrow("NEXT_REDIRECT: /");
    expect(mockRedirect).toHaveBeenCalledWith("/");
    expect(mockRedirect).not.toHaveBeenCalledWith("/login");
  });
});
