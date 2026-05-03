import { describe, expect, it } from "vitest";
import { resolveEmailEligibility } from "./eligibility";
import type {
  Contact,
  ContactEmailPreference,
  EmailSuppression,
} from "@/types/database";

function contact(id: string, email: string, name = id): Contact {
  return {
    id,
    email,
    name,
    phone: null,
    profile_id: null,
    created_at: "2026-05-01T00:00:00.000Z",
    updated_at: "2026-05-01T00:00:00.000Z",
  };
}

function preference(contactId: string): ContactEmailPreference {
  return {
    contact_id: contactId,
    newsletter_unsubscribed_at: "2026-05-01T00:00:00.000Z",
    newsletter_unsubscribed_source: "test",
    updated_by: null,
    updated_at: "2026-05-01T00:00:00.000Z",
  };
}

function suppression(contactId: string, email: string): EmailSuppression {
  return {
    id: `suppression-${contactId}`,
    contact_id: contactId,
    email,
    reason: "manual",
    detail: "Do not contact",
    provider: null,
    provider_event_id: null,
    created_by: null,
    created_at: "2026-05-01T00:00:00.000Z",
    lifted_at: null,
    lifted_by: null,
  };
}

describe("resolveEmailEligibility", () => {
  it("broadcast excludes newsletter-unsubscribed and suppressed contacts", () => {
    const contacts = [
      contact("contact-1", "one@example.com", "One"),
      contact("contact-2", "two@example.com", "Two"),
      contact("contact-3", "three@example.com", "Three"),
    ];

    const result = resolveEmailEligibility({
      kind: "broadcast",
      contacts,
      preferences: [preference("contact-2")],
      suppressions: [suppression("contact-3", "three@example.com")],
    });

    expect(result.eligible.map((item) => item.contactId)).toEqual(["contact-1"]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        contactId: "contact-2",
        reason: "newsletter_unsubscribed",
        status: "skipped_unsubscribed",
      }),
      expect.objectContaining({
        contactId: "contact-3",
        reason: "suppressed",
        status: "skipped_suppressed",
      }),
    ]);
  });

  it("outreach ignores newsletter unsubscribe but still excludes suppressions", () => {
    const contacts = [
      contact("contact-1", "one@example.com", "One"),
      contact("contact-2", "two@example.com", "Two"),
    ];

    const result = resolveEmailEligibility({
      kind: "outreach",
      contacts,
      preferences: [preference("contact-1")],
      suppressions: [suppression("contact-2", "two@example.com")],
      selectedContactIds: ["contact-1", "contact-2"],
    });

    expect(result.eligible.map((item) => item.contactId)).toEqual(["contact-1"]);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        contactId: "contact-2",
        reason: "suppressed",
        status: "skipped_suppressed",
      }),
    ]);
  });

  it("rejects outreach without selected contacts", () => {
    expect(() =>
      resolveEmailEligibility({
        kind: "outreach",
        contacts: [],
        preferences: [],
        suppressions: [],
        selectedContactIds: [],
      }),
    ).toThrow("Select at least one contact");
  });
});
