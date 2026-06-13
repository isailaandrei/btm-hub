import { describe, expect, it } from "vitest";
import { getRecipientSummary } from "./recipient-summary";

describe("getRecipientSummary", () => {
  it("describes selected outreach recipients", () => {
    expect(
      getRecipientSummary({
        kind: "outreach",
        selectedContactCount: 1,
      }),
    ).toEqual({
      headline: "1 selected contact",
      detail: "Outreach sends to selected contacts unless they are suppressed.",
    });
  });

  it("describes broadcast eligibility", () => {
    expect(
      getRecipientSummary({
        kind: "broadcast",
        selectedContactCount: 0,
      }),
    ).toEqual({
      headline: "All contacts with email",
      detail:
        "Broadcast skips newsletter unsubscribes and suppressed addresses.",
    });
  });
});
