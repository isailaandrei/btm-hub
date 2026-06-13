import { describe, expect, it, vi } from "vitest";

const mockListAdminAiThreadSummaries = vi.fn();
const mockGetAdminAiProviderAvailability = vi.fn();
const mockListEmailSends = vi.fn();
const mockListEmailTemplates = vi.fn();
const mockGetProfile = vi.fn();
const mockGetAdminContactsInitialData = vi.fn();
const mockAdminDataProvider = vi.fn((props: unknown) => ({
  type: "AdminDataProvider",
  props,
}));
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

vi.mock("./admin-data-provider", () => ({
  AdminDataProvider: mockAdminDataProvider,
}));

vi.mock("./admin-dashboard", () => ({
  AdminDashboard: mockAdminDashboard,
}));

const { default: AdminPage } = await import("./page");

describe("AdminPage", () => {
  it("does not fetch inactive tab data before rendering the default contacts tab", async () => {
    const initialContactsData = {
      applications: [],
      contactActivitySummaries: [],
      contactTags: [],
      contacts: [],
      isSortApproximateUntilHydration: false,
      pageSize: 25,
      tagCategories: [],
      tags: [],
      totalCount: 0,
    };
    const preferences = { contacts_table: { page_size: 25 } };

    mockGetProfile.mockResolvedValue({
      id: "profile-1",
      role: "admin",
      preferences,
    });
    mockGetAdminContactsInitialData.mockResolvedValue(initialContactsData);

    const result = await AdminPage();

    expect(result.props.children.type).toBe(mockAdminDataProvider);
    expect(result.props.children.props.initialContactsData).toBe(
      initialContactsData,
    );
    expect(result.props.children.props.initialPreferences).toBe(preferences);
    expect(result.props.children.props.children.type).toBe(mockAdminDashboard);
    expect(result.props.children.props.children.props).toEqual({
      initialContactsData,
    });
    expect(mockGetAdminContactsInitialData).toHaveBeenCalledWith(preferences);
    expect(mockListAdminAiThreadSummaries).not.toHaveBeenCalled();
    expect(mockGetAdminAiProviderAvailability).not.toHaveBeenCalled();
    expect(mockListEmailTemplates).not.toHaveBeenCalled();
    expect(mockListEmailSends).not.toHaveBeenCalled();
  });
});
