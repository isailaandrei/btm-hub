import { describe, expect, it } from "vitest";
import { resolveEmailEligibility } from "./eligibility";

const contacts = [
  { id: "c1", email: "one@example.com", name: "One" },
  { id: "c2", email: "two@example.com", name: "Two" },
  { id: "c3", email: "", name: "No Email" },
];

describe("resolveEmailEligibility", () => {
  it("excludes newsletter unsubscribes from broadcast", () => {
    const result = resolveEmailEligibility({
      kind: "broadcast",
      contacts,
      preferences: [
        {
          contact_id: "c2",
          newsletter_unsubscribed_at: "2026-04-28T00:00:00.000Z",
        },
      ],
      suppressions: [],
    });

    expect(result.eligible.map((item) => item.contactId)).toEqual(["c1"]);
    expect(result.skipped).toEqual([
      {
        contactId: "c2",
        email: "two@example.com",
        name: "Two",
        reason: "newsletter_unsubscribed",
      },
      { contactId: "c3", email: "", name: "No Email", reason: "missing_email" },
    ]);
  });

  it("allows outreach to newsletter-unsubscribed contacts but blocks suppressions", () => {
    const result = resolveEmailEligibility({
      kind: "outreach",
      contacts,
      preferences: [
        {
          contact_id: "c2",
          newsletter_unsubscribed_at: "2026-04-28T00:00:00.000Z",
        },
      ],
      suppressions: [{ contact_id: "c2", email: "two@example.com" }],
    });

    expect(result.eligible.map((item) => item.contactId)).toEqual(["c1"]);
    expect(result.skipped).toEqual([
      { contactId: "c2", email: "two@example.com", name: "Two", reason: "suppressed" },
      { contactId: "c3", email: "", name: "No Email", reason: "missing_email" },
    ]);
  });
});
