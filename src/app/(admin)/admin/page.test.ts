import { describe, expect, it, vi } from "vitest";

const mockListAdminAiThreadSummaries = vi.fn();
const mockGetAdminAiProviderAvailability = vi.fn();
const mockListEmailSends = vi.fn();
const mockListEmailTemplates = vi.fn();
const mockGetProfile = vi.fn();
const mockGetAdminContactsInitialData = vi.fn();
const mockAdminDashboard = vi.fn((props: unknown) => ({
  type: "AdminDashboard",
  props,
}));

vi.mock("@/lib/data/admin-ai", () => ({
  listAdminAiThreadSummaries: mockListAdminAiThreadSummaries,
}));

vi.mock("@/lib/admin-ai/provider", () => ({
  getAdminAiProviderAvailability: mockGetAdminAiProviderAvailability,
}));

vi.mock("@/lib/data/email-sends", () => ({
  listEmailSends: mockListEmailSends,
}));

vi.mock("@/lib/data/email-templates", () => ({
  listEmailTemplates: mockListEmailTemplates,
}));

vi.mock("@/lib/data/profiles", () => ({
  getProfile: mockGetProfile,
}));

vi.mock("@/lib/data/admin-contact-list", () => ({
  getAdminContactsInitialData: mockGetAdminContactsInitialData,
}));

vi.mock("./admin-dashboard", () => ({
  AdminDashboard: mockAdminDashboard,
}));

const { default: AdminPage } = await import("./page");

describe("AdminPage", () => {
  it("starts contacts data without blocking the default contacts tab shell", async () => {
    const initialContactsDataPromise = new Promise(() => {
      // Keep unresolved to prove AdminPage does not await contact data.
    });
    const preferences = { contacts_table: { page_size: 25 } };

    mockGetProfile.mockResolvedValue({
      id: "profile-1",
      role: "admin",
      preferences,
    });
    mockGetAdminContactsInitialData.mockReturnValue(initialContactsDataPromise);

    const result = await Promise.race([
      AdminPage(),
      new Promise((resolve) => setTimeout(() => resolve("blocked"), 0)),
    ]);

    expect(result).not.toBe("blocked");
    expect(result).toMatchObject({
      type: mockAdminDashboard,
      props: { initialContactsData: initialContactsDataPromise },
    });
    expect(mockGetAdminContactsInitialData).toHaveBeenCalledWith(preferences);
    expect(mockListAdminAiThreadSummaries).not.toHaveBeenCalled();
    expect(mockGetAdminAiProviderAvailability).not.toHaveBeenCalled();
    expect(mockListEmailTemplates).not.toHaveBeenCalled();
    expect(mockListEmailSends).not.toHaveBeenCalled();
  });

  it("does not fetch inactive tab data before rendering the default contacts tab", async () => {
    const initialContactsDataPromise = Promise.resolve({
      applications: [],
      contactActivitySummaries: [],
      contactTags: [],
      contacts: [],
      isSortApproximateUntilHydration: false,
      pageSize: 25,
      tagCategories: [],
      tags: [],
      totalCount: 0,
    });
    const preferences = { contacts_table: { page_size: 25 } };

    mockGetProfile.mockResolvedValue({
      id: "profile-1",
      role: "admin",
      preferences,
    });
    mockGetAdminContactsInitialData.mockReturnValue(initialContactsDataPromise);

    const result = await AdminPage();

    expect(result.type).toBe(mockAdminDashboard);
    expect(result.props).toEqual({
      initialContactsData: initialContactsDataPromise,
    });
    expect(mockGetAdminContactsInitialData).toHaveBeenCalledWith(preferences);
    expect(mockListAdminAiThreadSummaries).not.toHaveBeenCalled();
    expect(mockGetAdminAiProviderAvailability).not.toHaveBeenCalled();
    expect(mockListEmailTemplates).not.toHaveBeenCalled();
    expect(mockListEmailSends).not.toHaveBeenCalled();
  });
});
