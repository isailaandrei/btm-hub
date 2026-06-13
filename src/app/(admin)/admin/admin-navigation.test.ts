import { describe, expect, it } from "vitest";
import {
  getAdminItemActiveState,
  resolveAdminPanelTab,
} from "./admin-navigation";

describe("admin navigation", () => {
  it("defaults to contacts when the tab param is missing", () => {
    expect(resolveAdminPanelTab(null, { aiEnabled: true })).toEqual({
      invalidValue: null,
      tab: "contacts",
    });
  });

  it("rejects invalid tab params with the invalid value preserved", () => {
    expect(resolveAdminPanelTab("nope", { aiEnabled: true })).toEqual({
      invalidValue: "nope",
      tab: "contacts",
    });
  });

  it("rejects the ai tab when local AI is disabled", () => {
    expect(resolveAdminPanelTab("ai", { aiEnabled: false })).toEqual({
      invalidValue: "ai",
      tab: "contacts",
    });
  });

  it("marks contacts active for contact detail pages", () => {
    expect(
      getAdminItemActiveState({
        item: "contacts",
        pathname: "/admin/contacts/contact-1",
        tab: "email",
      }),
    ).toBe(true);
  });

  it("marks users active only on the users route", () => {
    expect(
      getAdminItemActiveState({
        item: "users",
        pathname: "/admin/users",
        tab: "contacts",
      }),
    ).toBe(true);
    expect(
      getAdminItemActiveState({
        item: "users",
        pathname: "/admin",
        tab: "contacts",
      }),
    ).toBe(false);
  });
});
