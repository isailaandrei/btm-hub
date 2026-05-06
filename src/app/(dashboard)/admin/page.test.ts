import { describe, expect, it, vi } from "vitest";

const mockListAdminAiThreadSummaries = vi.fn();
const mockGetAdminAiProviderAvailability = vi.fn();
const mockListEmailSends = vi.fn();
const mockListEmailTemplates = vi.fn();
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

vi.mock("./admin-dashboard", () => ({
  AdminDashboard: mockAdminDashboard,
}));

const { default: AdminPage } = await import("./page");

describe("AdminPage", () => {
  it("does not fetch inactive tab data before rendering the default contacts tab", async () => {
    const result = await AdminPage();

    expect(result.type).toBe(mockAdminDashboard);
    expect(result.props).toEqual({});
    expect(mockListAdminAiThreadSummaries).not.toHaveBeenCalled();
    expect(mockGetAdminAiProviderAvailability).not.toHaveBeenCalled();
    expect(mockListEmailTemplates).not.toHaveBeenCalled();
    expect(mockListEmailSends).not.toHaveBeenCalled();
  });
});
