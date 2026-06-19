import { describe, expect, it } from "vitest";
import { getRecipientSummary } from "./recipient-summary";

describe("getRecipientSummary", () => {
  it("describes selected outreach recipients", () => {
    expect(
      getRecipientSummary({
        kind: "outreach",
        selectedContactCount: 1,
        selectedManualRecipientCount: 0,
      }),
    ).toEqual({
      headline: "1 selected contact",
      detail:
        "A targeted email reaches the selected contacts, minus anyone excluded.",
    });
  });

  it("describes selected outreach contacts and manual recipients", () => {
    expect(
      getRecipientSummary({
        kind: "outreach",
        selectedContactCount: 2,
        selectedManualRecipientCount: 3,
      }),
    ).toEqual({
      headline: "5 selected recipients",
      detail:
        "A targeted email reaches the selected contacts and saved recipients, minus anyone excluded.",
    });
  });

  it("describes broadcast eligibility", () => {
    expect(
      getRecipientSummary({
        kind: "broadcast",
        selectedContactCount: 0,
        selectedManualRecipientCount: 4,
      }),
    ).toEqual({
      headline: "All contacts with email",
      detail:
        "A newsletter goes to every contact with an email, skipping unsubscribes and excluded addresses.",
    });
  });
});
