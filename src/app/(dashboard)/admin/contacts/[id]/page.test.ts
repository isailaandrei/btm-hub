import { notFound } from "next/navigation";
import { afterEach, describe, expect, it, vi } from "vitest";

const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";

const mockGetContactById = vi.fn();
const mockGetApplicationsByContactId = vi.fn();
const mockGetContactTags = vi.fn();
const mockGetTagCategories = vi.fn();
const mockGetTags = vi.fn();
const mockGetContactEvents = vi.fn();
const mockGetPortfolioItemsByContactProfileId = vi.fn();
const mockListAdminAiThreadSummaries = vi.fn();
const mockGetAdminAiProviderAvailability = vi.fn();

vi.mock("@/lib/data/contacts", () => ({
  getContactById: mockGetContactById,
  getApplicationsByContactId: mockGetApplicationsByContactId,
  getContactTags: mockGetContactTags,
  getTagCategories: mockGetTagCategories,
  getTags: mockGetTags,
}));

vi.mock("@/lib/data/contact-events", () => ({
  getContactEvents: mockGetContactEvents,
}));

vi.mock("@/lib/data/profile-portfolio", () => ({
  getPortfolioItemsByContactProfileId: mockGetPortfolioItemsByContactProfileId,
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
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not fetch hidden contact AI data while the panel is paused", async () => {
    mockGetContactById.mockResolvedValue({
      id: CONTACT_ID,
      name: "Jane Contact",
      email: "jane@example.com",
      phone: null,
      profile_id: "profile-1",
    });
    mockGetApplicationsByContactId.mockResolvedValue([]);
    mockGetContactTags.mockResolvedValue([]);
    mockGetContactEvents.mockResolvedValue([]);
    mockGetTagCategories.mockResolvedValue([]);
    mockGetTags.mockResolvedValue([]);
    mockGetPortfolioItemsByContactProfileId.mockResolvedValue([]);

    await ContactDetailPage({
      params: Promise.resolve({ id: CONTACT_ID }),
    });

    expect(mockGetContactById).toHaveBeenCalledWith(CONTACT_ID);
    expect(mockGetPortfolioItemsByContactProfileId).toHaveBeenCalledWith({
      profileId: "profile-1",
    });
    expect(mockListAdminAiThreadSummaries).not.toHaveBeenCalled();
    expect(mockGetAdminAiProviderAvailability).not.toHaveBeenCalled();
  });

  it("loads contact AI data when the local AI flag is enabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_SHOW_ADMIN_AI", "1");
    mockGetContactById.mockResolvedValue({
      id: CONTACT_ID,
      name: "Jane Contact",
      email: "jane@example.com",
      phone: null,
      profile_id: "profile-1",
    });
    mockGetApplicationsByContactId.mockResolvedValue([]);
    mockGetContactTags.mockResolvedValue([]);
    mockGetContactEvents.mockResolvedValue([]);
    mockGetTagCategories.mockResolvedValue([]);
    mockGetTags.mockResolvedValue([]);
    mockGetPortfolioItemsByContactProfileId.mockResolvedValue([]);
    mockListAdminAiThreadSummaries.mockResolvedValue([]);
    mockGetAdminAiProviderAvailability.mockReturnValue({
      isConfigured: true,
      unavailableReason: null,
      model: "gpt-5-mini",
    });

    await ContactDetailPage({
      params: Promise.resolve({ id: CONTACT_ID }),
    });

    expect(mockListAdminAiThreadSummaries).toHaveBeenCalledWith({
      scope: "contact",
      contactId: CONTACT_ID,
    });
    expect(mockGetAdminAiProviderAvailability).toHaveBeenCalled();
  });

  it("returns not found for invalid contact ids before fetching data", async () => {
    await expect(
      ContactDetailPage({
        params: Promise.resolve({ id: "not-a-uuid" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
    expect(mockGetContactById).not.toHaveBeenCalledWith("not-a-uuid");
  });
});
