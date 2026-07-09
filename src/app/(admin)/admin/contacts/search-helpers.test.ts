import { describe, it, expect } from "vitest";
import { contactMatchesSearch } from "./search-helpers";
import type { Contact } from "@/types/database";
import type { ContactListApplication } from "@/lib/admin/contacts/application-projection";

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: "c1",
    email: "jane.doe@example.com",
    name: "Jane Doe",
    phone: null,
    profile_id: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeApplication(
  phone: string | undefined,
): ContactListApplication {
  return {
    id: "a1",
    contact_id: "c1",
    program: "freediving",
    submitted_at: "2026-01-01T00:00:00Z",
    answers: phone === undefined ? {} : { phone },
  };
}

describe("contactMatchesSearch", () => {
  it("matches by name, case-insensitively", () => {
    expect(contactMatchesSearch(makeContact(), [], "jane")).toBe(true);
    expect(contactMatchesSearch(makeContact(), [], "DOE")).toBe(true);
  });

  it("matches by email", () => {
    expect(contactMatchesSearch(makeContact(), [], "jane.doe@ex")).toBe(true);
  });

  it("does not match an unrelated query", () => {
    expect(contactMatchesSearch(makeContact(), [], "zzz")).toBe(false);
  });

  it("matches the contact.phone column by digits", () => {
    const contact = makeContact({ phone: "+40 712 345 678" });
    expect(contactMatchesSearch(contact, [], "712345")).toBe(true);
  });

  it("ignores phone formatting in both the query and the stored value", () => {
    const contact = makeContact({ phone: "0712345678" });
    expect(contactMatchesSearch(contact, [], "0712 345 678")).toBe(true);
    expect(contactMatchesSearch(contact, [], "(0712) 345-678")).toBe(true);
  });

  it("matches an application answers.phone when contact.phone is null", () => {
    const contact = makeContact({ phone: null });
    const apps = [makeApplication("0770 111 222")];
    expect(contactMatchesSearch(contact, apps, "0770111222")).toBe(true);
  });

  it("does not match when no phone contains the query digits", () => {
    const contact = makeContact({ phone: "0712345678" });
    expect(contactMatchesSearch(contact, [], "999999")).toBe(false);
  });

  it("does not treat a query containing letters as a phone search", () => {
    // "anna 1" has a letter, so it must not substring-match a phone with "1".
    const contact = makeContact({ name: "Bob", email: "bob@x.com", phone: "555-1234" });
    expect(contactMatchesSearch(contact, [], "anna 1")).toBe(false);
  });

  it("still matches name/email even when the query has digits", () => {
    const contact = makeContact({ name: "Agent 007", phone: null });
    expect(contactMatchesSearch(contact, [], "agent 007")).toBe(true);
  });

  it("does not match a phone-like query when the contact has no phone anywhere", () => {
    const contact = makeContact({ phone: null });
    expect(contactMatchesSearch(contact, [makeApplication(undefined)], "123456")).toBe(
      false,
    );
  });

  it("tolerates non-string answers.phone values", () => {
    const contact = makeContact({ phone: null });
    const app: ContactListApplication = {
      ...makeApplication(undefined),
      answers: { phone: 40712345678 },
    };
    // A numeric answers.phone is ignored (only string phones are matched).
    expect(contactMatchesSearch(contact, [app], "712345")).toBe(false);
  });
});
