import { describe, expect, it } from "vitest";
import { contactIdFromPathname } from "./contact-detail-route";

const UUID = "a0000000-0000-0000-0000-000000000000";

describe("contactIdFromPathname", () => {
  it("extracts the id from a contact detail path", () => {
    expect(contactIdFromPathname(`/admin/contacts/${UUID}`)).toBe(UUID);
  });

  it("returns null for the dashboard root", () => {
    expect(contactIdFromPathname("/admin")).toBeNull();
  });

  it("returns null for other admin subroutes", () => {
    expect(contactIdFromPathname("/admin/users")).toBeNull();
    expect(contactIdFromPathname(`/admin/applications/${UUID}`)).toBeNull();
  });

  it("returns null for nested paths under a contact id", () => {
    expect(contactIdFromPathname(`/admin/contacts/${UUID}/edit`)).toBeNull();
  });

  it("returns null when the id segment is not a UUID", () => {
    expect(contactIdFromPathname("/admin/contacts/not-a-uuid")).toBeNull();
  });
});
