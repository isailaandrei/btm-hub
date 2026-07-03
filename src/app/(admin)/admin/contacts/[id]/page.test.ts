import { notFound } from "next/navigation";
import { describe, expect, it, vi } from "vitest";

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockGetContactDetailPageBootstrap = vi.fn();
const mockGetProfile = vi.fn();
const mockListAdminAiThreadSummaries = vi.fn();
const mockGetAdminAiProviderAvailability = vi.fn();

vi.mock("@/lib/data/contact-detail", () => ({
  getContactDetailPageBootstrap: mockGetContactDetailPageBootstrap,
}));

vi.mock("@/lib/data/profiles", () => ({
  getProfile: mockGetProfile,
}));

vi.mock("@/lib/data/admin-ai", () => ({
  listAdminAiThreadSummaries: mockListAdminAiThreadSummaries,
}));

vi.mock("@/lib/admin-ai/provider", () => ({
  getAdminAiProviderAvailability: mockGetAdminAiProviderAvailability,
}));

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

const { default: ContactDetailPage } = await import("./page");

describe("ContactDetailPage", () => {
  it("loads the contact page bootstrap (detail + sections) without fetching hidden AI data", async () => {
    mockGetContactDetailPageBootstrap.mockResolvedValue({
      applications: [],
      contact: {
        id: CONTACT_ID,
        name: "Jane Contact",
        email: "jane@example.com",
        phone: null,
        profile_id: "profile-1",
      },
      events: [],
      hasMore: false,
      nextCursor: null,
      sections: {
        emailStatus: { excluded: false, reason: null },
        tagSection: { allTags: [], categories: [], contactTagRows: [] },
        whatsappMessages: [],
      },
    });
    mockGetProfile.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.com",
      display_name: "Admin User",
      role: "admin",
      bio: null,
      avatar_url: null,
      preferences: {},
      created_at: "2026-05-22T00:00:00Z",
      updated_at: "2026-05-22T00:00:00Z",
    });

    await ContactDetailPage({
      params: Promise.resolve({ id: CONTACT_ID }),
    });

    expect(mockGetContactDetailPageBootstrap).toHaveBeenCalledWith(CONTACT_ID);
    expect(mockListAdminAiThreadSummaries).not.toHaveBeenCalled();
    expect(mockGetAdminAiProviderAvailability).not.toHaveBeenCalled();
  });

  it("returns not found for invalid contact ids before fetching data", async () => {
    await expect(
      ContactDetailPage({
        params: Promise.resolve({ id: "not-a-uuid" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(mockGetContactDetailPageBootstrap).not.toHaveBeenCalledWith(
      "not-a-uuid",
    );
  });
});
