import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireAdmin,
  getContactDetailBootstrap,
  getPortfolioItemsByContactProfileId,
} = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getContactDetailBootstrap: vi.fn(),
  getPortfolioItemsByContactProfileId: vi.fn(),
}));

vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin }));
vi.mock("@/lib/data/contact-detail", () => ({ getContactDetailBootstrap }));
vi.mock("@/lib/data/profile-portfolio", () => ({
  getPortfolioItemsByContactProfileId,
}));

import {
  loadContactDetailAction,
  loadContactPortfolioAction,
} from "./contact-detail-actions";

const CONTACT_ID = "a0000000-0000-0000-0000-000000000000";
const PROFILE_ID = "b0000000-0000-0000-0000-000000000000";

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ role: "admin" });
});

describe("loadContactDetailAction", () => {
  it("rejects invalid UUIDs before touching auth or data", async () => {
    await expect(loadContactDetailAction("not-a-uuid")).rejects.toThrow(
      /Invalid contact ID/,
    );
    expect(requireAdmin).not.toHaveBeenCalled();
    expect(getContactDetailBootstrap).not.toHaveBeenCalled();
  });

  it("enforces admin and returns the bootstrap", async () => {
    const bootstrap = { contact: { id: CONTACT_ID } };
    getContactDetailBootstrap.mockResolvedValue(bootstrap);

    const result = await loadContactDetailAction(CONTACT_ID);

    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(getContactDetailBootstrap).toHaveBeenCalledWith(CONTACT_ID);
    expect(result).toBe(bootstrap);
  });

  it("propagates an unauthorized error", async () => {
    requireAdmin.mockRejectedValue(new Error("Unauthorized"));
    await expect(loadContactDetailAction(CONTACT_ID)).rejects.toThrow(
      "Unauthorized",
    );
    expect(getContactDetailBootstrap).not.toHaveBeenCalled();
  });
});

describe("loadContactPortfolioAction", () => {
  it("returns empty without a profile id, but still requires admin", async () => {
    const result = await loadContactPortfolioAction(null);
    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(result).toEqual([]);
    expect(getPortfolioItemsByContactProfileId).not.toHaveBeenCalled();
  });

  it("loads portfolio items for a valid profile id", async () => {
    const items = [{ id: "p1" }];
    getPortfolioItemsByContactProfileId.mockResolvedValue(items);

    const result = await loadContactPortfolioAction(PROFILE_ID);

    expect(requireAdmin).toHaveBeenCalledOnce();
    expect(getPortfolioItemsByContactProfileId).toHaveBeenCalledWith({
      profileId: PROFILE_ID,
    });
    expect(result).toBe(items);
  });

  it("rejects an invalid profile id", async () => {
    await expect(loadContactPortfolioAction("nope")).rejects.toThrow(
      /Invalid profile ID/,
    );
    expect(getPortfolioItemsByContactProfileId).not.toHaveBeenCalled();
  });
});
